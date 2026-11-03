/* Z-buffer Canvas fallback from the SAME Three scene. Static, no WebGL claim. */
import * as T from './vendor/three.module.min.js';
export function paintScene(core){
 const canvas=core.renderer.domElement,rect=canvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas 2D không dùng được');core.scene.updateMatrixWorld(true);core.camera.updateMatrixWorld(true);
 const vp=new T.Matrix4().multiplyMatrices(core.camera.projectionMatrix,core.camera.matrixWorldInverse),transparent=[],colors=new Map(),p1=new T.Vector3(),p2=new T.Vector3(),p3=new T.Vector3(),light=new T.Vector3(-.3,.85,.4).normalize();
 const image=ctx.createImageData(width,height),pixels=image.data,depth=new Float32Array(width*height);depth.fill(Infinity);for(let i=0;i<pixels.length;i+=4){pixels[i]=9;pixels[i+1]=26;pixels[i+2]=45;pixels[i+3]=255;}let drawn=0;
 function triangle(p,a,b,c,rgb,alpha){
  const ax=p[a],ay=p[a+1],bx=p[b],by=p[b+1],cx=p[c],cy=p[c+1],area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(Math.abs(area)<.5)return;
  const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx))),y0=Math.max(0,Math.floor(Math.min(ay,by,cy))),y1=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));
  if(x0>x1||y0>y1)return;drawn++;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const px=x+.5,py=y+.5,w1=((bx-px)*(cy-py)-(by-py)*(cx-px))/area,w2=((cx-px)*(ay-py)-(cy-py)*(ax-px))/area,w3=1-w1-w2;if(w1<0||w2<0||w3<0)continue;
   const z=w1*p[a+2]+w2*p[b+2]+w3*p[c+2],at=y*width+x;if(z>=depth[at])continue;const q=at*4;
   if(alpha>.98){depth[at]=z;pixels[q]=rgb[0];pixels[q+1]=rgb[1];pixels[q+2]=rgb[2];}
   else{pixels[q]=pixels[q]*(1-alpha)+rgb[0]*alpha;pixels[q+1]=pixels[q+1]*(1-alpha)+rgb[1]*alpha;pixels[q+2]=pixels[q+2]*(1-alpha)+rgb[2]*alpha;}
  }
 }
 core.modelRoot.traverse(mesh=>{
  if(!mesh.isMesh)return;for(let n=mesh;n;n=n.parent)if(!n.visible)return;
  const geo=mesh.geometry,pos=geo.getAttribute('position'),index=geo.index,m=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;if(!pos||!m||m.opacity<.12)return;
  const count=index?.count||pos.count,points=new Float32Array(pos.count*3),world=new Float32Array(pos.count*3),v=new T.Vector3();
  for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);world.set([v.x,v.y,v.z],i*3);v.applyMatrix4(vp);points.set([(v.x+1)*width/2,(1-v.y)*height/2,v.z],i*3);}
  for(let i=0;i<count;i+=3){const a=(index?index.getX(i):i)*3,b=(index?index.getX(i+1):i+1)*3,c=(index?index.getX(i+2):i+2)*3,cross=(points[b]-points[a])*(points[c+1]-points[a+1])-(points[b+1]-points[a+1])*(points[c]-points[a]);if(Math.abs(cross)<.5||(m.side!==T.DoubleSide&&cross>=0))continue;
   p1.fromArray(world,a);p2.fromArray(world,b).sub(p1);p3.fromArray(world,c).sub(p1);const shade=Math.round((m.isMeshBasicMaterial?1:.5+.5*Math.max(0,p2.cross(p3).normalize().dot(light)))*16)/16,key=m.uuid+':'+shade;
   let rgb=colors.get(key);if(!rgb){const col=(m.map?new T.Color('#124568'):(m.color||new T.Color('#98b4c2')).clone()).multiplyScalar(shade);if(m.emissive)col.add(m.emissive.clone().multiplyScalar(Math.min(.5,m.emissiveIntensity||0)));col.convertLinearToSRGB();rgb=[col.r,col.g,col.b].map(x=>Math.min(255,Math.round(x*255)));colors.set(key,rgb);}
   const alpha=m.opacity??1;if(alpha<.98)transparent.push({p:points,a,b,c,rgb,alpha,z:(points[a+2]+points[b+2]+points[c+2])/3});else triangle(points,a,b,c,rgb,alpha);
  }
 });
 transparent.sort((a,b)=>b.z-a.z);for(const t of transparent)triangle(t.p,t.a,t.b,t.c,t.rgb,t.alpha);
 ctx.putImageData(image,0,0);canvas.dataset.renderer='canvas-same-scene';canvas.dataset.robotCount=String(core.fleetStats().actors);canvas.dataset.triangles=String(drawn);return {triangles:drawn,width,height};
}
