import * as THREE from 'three'

export interface GhostStyle { lowTint?: string; highTint?: string; resolution?: number; gallery?: boolean }

/** A nearest-surface composite gives the whole character one transparent wash. */
export class GhostAsset {
  readonly group = new THREE.Group()
  private maskScene = new THREE.Scene()
  private modelRoot = new THREE.Group()
  private target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) })
  private edges = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false })
  private ink = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false })
  private edgeScene = new THREE.Scene()
  private inkScene = new THREE.Scene()
  private edgeMaterial: THREE.ShaderMaterial
  private inkMaterial: THREE.ShaderMaterial
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  private masks = new Map<THREE.Material, THREE.ShaderMaterial>()
  private viewport = new THREE.Vector2()
  private inverse = new THREE.Matrix4()
  private material: THREE.ShaderMaterial
  private disposed = false
  private bounds: THREE.Box3
  private corner = new THREE.Vector3()
  private screenBounds = new THREE.Vector4(-1, -1, 1, 1)

  constructor(readonly model: THREE.Object3D, private style: GhostStyle = {}) {
    // The gallery has SMAA already; five supersampled float masks would waste hundreds of MB.
    if (style.gallery) { this.target.samples = 0; this.target.texture.type = THREE.UnsignedByteType }
    this.group.name = 'YOZO ghost'
    this.modelRoot.matrixAutoUpdate = false
    this.maskScene.add(this.modelRoot); this.modelRoot.add(model)
    this.modelRoot.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(this.modelRoot)
    this.bounds = bounds.clone().expandByScalar(style.gallery ? .4 : .22)
    this.modelRoot.traverse(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      this.originals.set(mesh, mesh.material)
      for (const original of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (this.masks.has(original)) continue
        const source = original as THREE.MeshStandardMaterial
        source.map?.updateMatrix()
        // Exclude the normal map's microdetail from the line art.
        this.masks.set(original, new THREE.ShaderMaterial({
          uniforms: {
            sourceMap: { value: source.map ?? null }, hasMap: { value: Boolean(source.map) },
            uvTransform: { value: source.map?.matrix ?? new THREE.Matrix3() },
            sourceColour: { value: source.color ?? new THREE.Color(1, 1, 1) },
            alphaCutoff: { value: source.alphaTest || 0 },
          },
          vertexShader: `
            #include <common>
            #include <morphtarget_pars_vertex>
            #include <skinning_pars_vertex>
            varying vec3 surfaceNormal;
            varying vec2 sourceUv;
            uniform mat3 uvTransform;
            void main(){
              sourceUv=(uvTransform*vec3(uv,1.)).xy;
              #include <beginnormal_vertex>
              #include <morphnormal_vertex>
              #include <skinbase_vertex>
              #include <skinnormal_vertex>
              #include <defaultnormal_vertex>
              surfaceNormal=normalize(transformedNormal);
              #include <begin_vertex>
              #include <morphtarget_vertex>
              #include <skinning_vertex>
              #include <project_vertex>
            }
          `,
          fragmentShader: `
            varying vec3 surfaceNormal;
            varying vec2 sourceUv;
            uniform sampler2D sourceMap;
            uniform bool hasMap;
            uniform vec3 sourceColour;
            uniform float alphaCutoff;
            void main(){
              vec4 albedo=hasMap?texture2D(sourceMap,sourceUv):vec4(sourceColour,1.);
              if(albedo.a<alphaCutoff)discard;
              vec3 perceptual=pow(max(albedo.rgb,vec3(0.)),vec3(1./2.2));
              float luminance=dot(perceptual,vec3(.2126,.7152,.0722));
              gl_FragColor=vec4(normalize(surfaceNormal)*.5+.5,luminance);
            }
          `,
          side: original.side, toneMapped: false,
        }))
      }
    })
    const uniforms = {
        field: { value: this.target.texture }, depthField: { value: this.target.depthTexture },
        edgeField: { value: this.ink.texture },
        viewport: { value: this.viewport }, texel: { value: new THREE.Vector2() },
        strokeTexel: { value: new THREE.Vector2() },
        fieldSize: { value: new THREE.Vector2() },
        screenBounds: { value: this.screenBounds },
        clipToLocal: { value: new THREE.Matrix4() }, nearFar: { value: new THREE.Vector2() },
        heightRange: { value: new THREE.Vector2(bounds.min.y, Math.max(.001, bounds.max.y - bounds.min.y)) },
        lowTint: { value: new THREE.Color(style.lowTint ?? '#705b9b') }, highTint: { value: new THREE.Color(style.highTint ?? '#c4788e') },
      }
    this.edgeMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `void main(){ gl_Position=vec4(position.xy,0.0,1.0); }`,
      fragmentShader: `
        uniform sampler2D field,depthField;
        uniform vec2 fieldSize,texel,nearFar,heightRange;
        uniform mat4 clipToLocal;
        uniform vec3 lowTint,highTint;
        float metric(float d){return nearFar.x*nearFar.y/(nearFar.y-d*(nearFar.y-nearFar.x));}
        float filteredTone(vec2 uv){
          return textureLod(field,uv,0.).a*.4
            +(textureLod(field,uv+vec2(texel.x,0.),0.).a+textureLod(field,uv-vec2(texel.x,0.),0.).a
            +textureLod(field,uv+vec2(0.,texel.y),0.).a+textureLod(field,uv-vec2(0.,texel.y),0.).a)*.15;
        }
        vec2 lineAt(vec2 uv){
          float z=textureLod(depthField,uv,0.).r;
          if(z>=1.)return vec2(0.);
          vec3 normal=textureLod(field,uv,0.).rgb*2.-1.;
          float crease=0.,silhouette=0.,overlap=0.;
          for(int i=0;i<4;i++){
            vec2 stepUv=vec2(cos(float(i)*1.570796),sin(float(i)*1.570796))*texel;
            float otherDepth=textureLod(depthField,uv+stepUv,0.).r;
            float dz=metric(otherDepth)-metric(z);
            if(otherDepth>=1.)silhouette=1.;
            else overlap=max(overlap,smoothstep(.018,.045,dz));
            if(otherDepth<1. && abs(dz)<.025){
              vec3 other=textureLod(field,uv+stepUv,0.).rgb*2.-1.;
              crease=max(crease,length(normal-other));
            }
          }
          float dx=filteredTone(uv+vec2(texel.x,0.))-filteredTone(uv-vec2(texel.x,0.));
          float dy=filteredTone(uv+vec2(0.,texel.y))-filteredTone(uv-vec2(0.,texel.y));
          float painted=smoothstep(.14,.26,length(vec2(dx,dy)));
          float fold=smoothstep(.4,.7,crease)*.16;
          return vec2(silhouette,max(overlap*.55,max(painted*.55,fold)));
        }
        void main(){
          gl_FragColor=vec4(lineAt(gl_FragCoord.xy/fieldSize),0.,1.);
        }
      `,
      depthTest: false, depthWrite: false, toneMapped: false,
    })
    const edgeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.edgeMaterial)
    edgeQuad.frustumCulled = false; this.edgeScene.add(edgeQuad)
    // Clean the interior ink before widening it, so texture flecks do not become bold marks.
    this.inkMaterial = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, edgeField: { value: this.edges.texture } },
      vertexShader: `void main(){ gl_Position=vec4(position.xy,0.0,1.0); }`,
      fragmentShader: `
        uniform sampler2D edgeField;
        uniform vec2 fieldSize,texel;
        void main(){
          vec2 uv=gl_FragCoord.xy/fieldSize;
          vec2 edge=textureLod(edgeField,uv,0.).rg;
          float support=0.;
          for(int i=0;i<8;i++){
            vec2 direction=vec2(cos(float(i)*.785398),sin(float(i)*.785398));
            support+=textureLod(edgeField,uv+direction*texel*1.8,0.).g;
          }
          float detail=edge.g*smoothstep(.9,2.,support/max(edge.g,.06));
          gl_FragColor=vec4(edge.r,detail,0.,1.);
        }
      `,
      depthTest: false, depthWrite: false, toneMapped: false,
    })
    const inkQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.inkMaterial)
    inkQuad.frustumCulled = false; this.inkScene.add(inkQuad)
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `uniform vec4 screenBounds; void main(){ gl_Position=vec4(mix(screenBounds.xy,screenBounds.zw,position.xy*.5+.5),0.0,1.0); }`,
      fragmentShader: `
        uniform sampler2D edgeField,depthField;
        uniform vec2 viewport,texel,strokeTexel,heightRange;
        uniform mat4 clipToLocal;
        uniform vec3 lowTint,highTint;
        void main(){
          vec2 uv=gl_FragCoord.xy/viewport;
          float z=textureLod(depthField,uv,0.).r;
          vec2 edge=textureLod(edgeField,uv,0.).rg;
          float contour=edge.r,detail=edge.g,halo=0.;
          for(int i=0;i<8;i++){
            vec2 direction=vec2(cos(float(i)*.785398),sin(float(i)*.785398));
            contour=max(contour,textureLod(edgeField,uv+direction*strokeTexel,0.).r);
            detail=max(detail,textureLod(edgeField,uv+direction*strokeTexel*.65,0.).g);
          }
          float line=max(contour,min(.8,detail*1.2));
          for(int i=0;i<8;i++){
            float angle=float(i)*.785398;
            vec2 direction=vec2(cos(angle),sin(angle));
            float coreDepth=textureLod(depthField,uv+direction*strokeTexel,0.).r;
            float glowDepth=textureLod(depthField,uv+direction*strokeTexel*3.25,0.).r;
            if(z>=1. && glowDepth<1.)halo+=.026;
            if(z>=1. && coreDepth<1.)line=max(line,.98);
          }
          if(z>=1.){
            if(max(line,halo)<=0.)discard;
            float nearest=1.;
            for(int i=0;i<8;i++){
              vec2 direction=vec2(cos(float(i)*.785398),sin(float(i)*.785398));
              nearest=min(nearest,textureLod(depthField,uv+direction*strokeTexel*3.25,0.).r);
            }
            gl_FragDepth=nearest;
            gl_FragColor=vec4(vec3(2.3,2.25,2.18),max(line,halo));
          }else{
            gl_FragDepth=z;
            vec4 position=clipToLocal*vec4(uv*2.-1.,z*2.-1.,1.);
            float height=clamp((position.y/position.w-heightRange.x)/heightRange.y,0.,1.);
            vec3 wash=mix(lowTint,highTint,smoothstep(.10,.96,height));
            float alpha=mix(.22,.29,smoothstep(.05,.95,height));
            vec3 colour=mix(wash,vec3(2.3,2.25,2.18),line);
            gl_FragColor=vec4(colour,mix(alpha,.96,line));
          }
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, depthTest: true,
      // The gallery's room-edge pass reads alpha; retain the visitors' white ink.
      ...(style.gallery ? { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor } : {}),
    })
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    fill.frustumCulled = false; this.group.add(fill)
  }

  prepare(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, size: { width: number; height: number }): void {
    if (this.disposed || !this.group.visible) return
    camera.updateWorldMatrix(true, false)
    this.group.updateMatrixWorld(true)
    this.modelRoot.matrix.copy(this.group.matrixWorld)
    this.maskScene.updateMatrixWorld(true)
    this.viewport.set(size.width, size.height)
    const scale = Math.min(1, (this.style.resolution ?? 2560) / Math.max(size.width, size.height))
    const width = Math.max(1, Math.round(size.width * scale)), height = Math.max(1, Math.round(size.height * scale))
    if (width !== this.target.width || height !== this.target.height) { this.target.setSize(width, height); this.edges.setSize(width, height); this.ink.setSize(width, height) }
    const uniforms = this.material.uniforms
    uniforms.fieldSize.value.set(width, height)
    uniforms.texel.value.set(.65 * renderer.getPixelRatio() / size.width, .65 * renderer.getPixelRatio() / size.height)
    uniforms.strokeTexel.value.set(.85 * renderer.getPixelRatio() / size.width, .85 * renderer.getPixelRatio() / size.height)
    uniforms.nearFar.value.set(camera.near, camera.far)
    uniforms.clipToLocal.value.copy(this.inverse.copy(this.group.matrixWorld).invert()).multiply(camera.matrixWorld).multiply(camera.projectionMatrixInverse)
    // Only shade the character's screen rectangle, rather than three full screens per visitor.
    this.screenBounds.set(1, 1, -1, -1)
    let crossesNear = false
    for (let i = 0; i < 8; i++) {
      this.corner.set(i & 1 ? this.bounds.max.x : this.bounds.min.x, i & 2 ? this.bounds.max.y : this.bounds.min.y, i & 4 ? this.bounds.max.z : this.bounds.min.z)
        .applyMatrix4(this.group.matrixWorld).project(camera)
      crossesNear ||= this.corner.z < -1 || this.corner.z > 1
      this.screenBounds.x = Math.min(this.screenBounds.x, this.corner.x); this.screenBounds.y = Math.min(this.screenBounds.y, this.corner.y)
      this.screenBounds.z = Math.max(this.screenBounds.z, this.corner.x); this.screenBounds.w = Math.max(this.screenBounds.w, this.corner.y)
    }
    if (crossesNear) this.screenBounds.set(-1, -1, 1, 1)
    this.screenBounds.clampScalar(-1, 1)
    const left = Math.max(0, Math.floor((this.screenBounds.x + 1) * width / 2)), bottom = Math.max(0, Math.floor((this.screenBounds.y + 1) * height / 2))
    const right = Math.min(width, Math.ceil((this.screenBounds.z + 1) * width / 2)), top = Math.min(height, Math.ceil((this.screenBounds.w + 1) * height / 2))
    const previous = renderer.getRenderTarget(), previousAlpha = renderer.getClearAlpha(), previousColor = renderer.getClearColor(new THREE.Color())
    try {
      for (const [mesh, original] of this.originals) mesh.material = Array.isArray(original) ? original.map(m => this.masks.get(m)!) : this.masks.get(original)!
      renderer.setClearColor(0x000000, 0)
      for (const target of [this.target, this.edges, this.ink]) {
        target.scissor.set(left, bottom, Math.max(0, right - left), Math.max(0, top - bottom)); target.scissorTest = true
      }
      const render = (target: THREE.WebGLRenderTarget, scene: THREE.Scene) => {
        // Clear the old rectangle as well: outline neighbours must never sample a previous pose.
        target.scissorTest = false; renderer.setRenderTarget(target); renderer.clear()
        target.scissorTest = true; renderer.setRenderTarget(target); renderer.render(scene, camera)
      }
      render(this.target, this.maskScene); render(this.edges, this.edgeScene); render(this.ink, this.inkScene)
    } finally {
      for (const [mesh, original] of this.originals) mesh.material = original
      renderer.setRenderTarget(previous); renderer.setClearColor(previousColor, previousAlpha)
    }
  }

  releaseModel(): THREE.Object3D { this.model.removeFromParent(); return this.model }
  captureModel(): void { this.modelRoot.add(this.model) }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose() })
    this.edgeScene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose() })
    this.inkScene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose() })
    this.material.dispose(); this.edgeMaterial.dispose(); this.inkMaterial.dispose(); this.target.dispose(); this.edges.dispose(); this.ink.dispose(); this.masks.forEach(material => material.dispose())
    this.originals.clear(); this.masks.clear(); this.group.removeFromParent(); this.group.clear(); this.maskScene.clear()
  }
}
