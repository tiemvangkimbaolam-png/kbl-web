/* KBL scene-only placement. Real queue/account state remains external. */
import {createLiveFleetController as original} from './live-motion.mjs';
import {waitingSlots} from './navigation.mjs';
import {motionAt} from './motion.mjs';
import {DECK,SOFA_SEATS,CHARGE_PODS,ENERGY,SPORT_SLOTS} from './room-zones40.mjs?v=R40';
function pose(p,t,zone,{seated=false}={}){
 const floorY=p.floorY??DECK.floorY,seatY=p.seatY;
 return {...motionAt(seated?16:3),x:p.x,z:p.z,yaw:p.yaw||0,zone,floorY,seatY,seated:seated?1:0,seatContact:seated,contact:0,typing:0,walking:false,gaitBlend:0,
  ankleY:.11242,robotPelvisY:seated?seatY-floorY+.0286:.67963,phase:seated?'resting':'standby',animationTime:t,
  localFeet:seated?{L:{x:-.1104,z:.27,y:0},R:{x:.1104,z:.27,y:0}}:null,
  handTargets:seated?{L:{x:-.18,z:.23,y:seatY-floorY+.15},R:{x:.18,z:.23,y:seatY-floorY+.15}}:null};
}
export function sportPose(slot,t){
 const m=pose(slot,t,'sport');m.sport=slot.kind;m.phase='sport';m.robotPelvisY=slot.kind==='treadmill'?.625:slot.kind==='weights'?.645:.635;
 if(slot.kind.startsWith('ping-')){
  const phase=t*Math.PI*1.25+(slot.kind==='ping-right'?Math.PI:0),s=Math.sin(phase);
  m.handTargets={R:{x:.06,z:.27+.06*s,y:.78+.02*Math.cos(phase)},L:{x:-.20,z:.12,y:.77}};
  m.localFeet={L:{x:-.17,z:.03,y:0},R:{x:.17,z:-.04,y:0}};
 }else if(slot.kind==='treadmill'){
  m.localFeet={};for(const [side,offset]of [['L',0],['R',.5]]){const u=((t*1.2+offset)%1+1)%1;const swing=u>.58?(u-.58)/.42:0;m.localFeet[side]={x:side==='L'?-.11:.11,z:u<.58?.16-.32*u/.58:-.16+.32*swing,y:swing?Math.sin(Math.PI*swing)*.075:0};}
  m.handTargets={L:{x:-.27,z:.40,y:1.028474},R:{x:.27,z:.40,y:1.028474}};
 }else{
  const lift=(1-Math.cos(t*Math.PI*.8))*.5;
  m.handTargets={L:{x:-.30,z:.28+.04*lift,y:.68+.25*lift},R:{x:.30,z:.28+.04*lift,y:.68+.25*lift}};
  m.localFeet={L:{x:-.15,z:0,y:0},R:{x:.15,z:0,y:0}};
 }
 return m;
}
export function createLiveFleetController(){
 const base=original();let hadAccounts=false;
 function display(){const list=base.view();let pods=0,rest=0,error=0,sports=0,edge=0;const standing=waitingSlots(40),t=base.clock();
  const stand=()=>pose(standing[edge++],t,'standing');
  const relax=()=>rest<SOFA_SEATS.length?pose(SOFA_SEATS[rest++],t,'sofa',{seated:true}):sports<SPORT_SLOTS.length?sportPose(SPORT_SLOTS[sports++],t):stand();
  return list.map(a=>{
   let m=null;
   if(a.data.kind==='vacant')m=pods<CHARGE_PODS.length?pose(CHARGE_PODS[pods++],t,'charging'):relax();
   else if(a.data.state==='error')m=error++===0?pose(ENERGY,t,'energy'):stand();
   else if(a.data.state==='quota')m=pods<CHARGE_PODS.length?pose(CHARGE_PODS[pods++],t,'charging'):stand();
   else if(['offline','unknown'].includes(a.data.state))m=stand();
   else if(['ready','waiting','completed'].includes(a.data.state)&&!a.seatId)m=relax();
   if(!m)return a;
   return {...a,visible:true,seatId:null,station:{x:0,z:0},motion:m,position:{x:m.x,z:m.z},phase:m.phase,waitingReason:''};
  });
 }
 return {...base,update(s){if(!hadAccounts&&s.bots.some(b=>b.kind==='account')){base.clear();hadAccounts=true;}base.update(s);return display();},step(dt){base.step(dt);return display();},view:display};
}
