/** Account keyed mesh ownership. Shared model assets are disposed by the parent scene only. */
import * as T from '../vendor/three.module.min.js';
import {clone as cloneRig} from '../vendor/addons/SkeletonUtils.js';
export function createFleetScene({parent,template,prepareRig,poseRobot}){
 const root=new T.Group();root.name='LiveAccountRobots';parent.add(root);
 const records=new Map(),ringGeometry=new T.RingGeometry(.30,.33,40);let selected=null,last=[];
 const propGeometry=[],propMaterials=[];
 const geo=g=>(propGeometry.push(g),g),mat=m=>(propMaterials.push(m),m);
 const rubber=mat(new T.MeshStandardMaterial({color:0x247f91,roughness:.5})),edge=mat(new T.MeshStandardMaterial({color:0xd4ad64,metalness:.65,roughness:.3})),weight=mat(new T.MeshStandardMaterial({color:0x10263e,metalness:.45,roughness:.4}));
 const paddleFace=geo(new T.CylinderGeometry(.105,.105,.016,20)),handle=geo(new T.CylinderGeometry(.020,.020,.15,8)),grip=geo(new T.CylinderGeometry(.018,.018,.34,8)),plate=geo(new T.CylinderGeometry(.080,.080,.055,12));
 function props(){const p={paddle:new T.Group(),L:new T.Group(),R:new T.Group()};p.paddle.name='SportsPaddle';let m=new T.Mesh(paddleFace,rubber);m.rotation.x=Math.PI/2;m.position.y=.16;p.paddle.add(m);m=new T.Mesh(handle,edge);p.paddle.add(m);
  for(const side of ['L','R']){p[side].name='Dumbbell_'+side;const g=new T.Mesh(grip,edge);g.rotation.z=Math.PI/2;p[side].add(g);for(const x of [-.145,.145]){const w=new T.Mesh(plate,weight);w.rotation.z=Math.PI/2;w.position.x=x;p[side].add(w);}}
  for(const o of Object.values(p)){o.visible=false;root.add(o);}return p;
 }
 function remove(record){record.root.removeFromParent();record.ring.removeFromParent();for(const o of Object.values(record.props||{}))o.removeFromParent();record.ring.material.dispose();for(const m of record.ownedMaterials||[])m.dispose();/* Never dispose shared GLB geometry/material here. */}
 function update(actors){
  last=actors;const ids=new Set(actors.map(a=>a.id));for(const [id,record]of records)if(!ids.has(id)){remove(record);records.delete(id);}
  for(const a of actors){let record=records.get(a.id);if(!record&&template){
    const model=cloneRig(template),ownedMaterials=[];if(a.data.kind==='vacant'){const materials=new Map();model.traverse(o=>{if(!o.isMesh)return;const clone=m=>{if(!materials.has(m)){const c=m.clone();if(c.color)c.color.lerp(new T.Color('#687b8c'),.8);if(c.emissive)c.emissive.multiplyScalar(.15);materials.set(m,c);ownedMaterials.push(c);}return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);});}model.name='AccountRobot_'+a.id;model.userData.connectionId=a.id;root.add(model);
    const rig=prepareRig(model),ring=new T.Mesh(ringGeometry,new T.MeshBasicMaterial({color:a.data.color,transparent:true,opacity:.36,depthWrite:false,toneMapped:false}));
    ring.name='AccountSelection_'+a.id;ring.rotation.x=-Math.PI/2;root.add(ring);record={root:model,rig,ring,metrics:{},ownedMaterials};records.set(a.id,record);
   }
   if(!record)continue;record.root.visible=!!a.visible;record.ring.visible=!!a.visible;
   record.ring.material.color.set(a.data.color);record.ring.material.opacity=a.id===selected ? .82 : .27;
   record.metrics=poseRobot(record.rig,a.motion,a.station);record.ring.position.set(a.position.x,(a.motion.floorY||0)+.046,a.position.z);
   if(a.motion.sport&&!record.props)record.props=props();
   if(record.props){for(const o of Object.values(record.props))o.visible=false;
    if(a.visible&&a.motion.sport?.startsWith('ping-')){const p=record.props.paddle;p.visible=true;p.position.copy(record.rig.bones.Wrist_R.getWorldPosition(new T.Vector3()));p.position.y-=.04;p.rotation.set(0,a.motion.yaw,0);}
    if(a.visible&&a.motion.sport==='weights')for(const side of ['L','R']){const p=record.props[side];p.visible=true;p.position.copy(record.rig.bones['Wrist_'+side].getWorldPosition(new T.Vector3()));p.position.y-=.055;p.rotation.set(0,a.motion.yaw,0);}
   }
  }
  return [...records].map(([id,r])=>({id,...r.metrics}));
 }
 function labels(camera,width,height){camera.updateMatrixWorld(true);return last.map(a=>{
  const r=records.get(a.id);if(!r||!a.visible)return {id:a.id,visible:false};
  const p=r.rig.bones.Head_Rig.getWorldPosition(new T.Vector3());p.y+=.38;p.project(camera);
  return {id:a.id,visible:root.visible&&p.z>=-1&&p.z<=1&&Math.abs(p.x)<1.06&&Math.abs(p.y)<1.06,x:(p.x+1)*width/2,y:(1-p.y)*height/2};
 });}
 function pick(ndc,camera){const ray=new T.Raycaster();ray.setFromCamera(ndc,camera);const hits=ray.intersectObjects([...records.values()].filter(r=>r.root.visible).map(r=>r.root),true);let node=hits[0]?.object;while(node){if(node.userData.connectionId)return node.userData.connectionId;node=node.parent;}return null;}
 return {root,update,labels,pick,setSelected(id){selected=id;},size:()=>records.size,
  dispose(){for(const record of records.values())remove(record);records.clear();ringGeometry.dispose();for(const g of propGeometry)g.dispose();for(const m of propMaterials)m.dispose();root.removeFromParent();}};
}
