/** Shared furniture/pose contract, metres, Y up. No account or queue mutations. */
export const DECK=Object.freeze({centerX:4,width:26,minX:-8.6,maxX:16.6,minZ:-6.98,maxZ:6.98,floorY:.0205});
export const LOUNGE=Object.freeze({x:4.56,z:4.8,floorY:.0475,seatY:.52,sofaX:-.65,sofaZ:-1.15,width:3.10,cushionZ:.08,sitZ:.23});
export const SOFA_SEATS=Object.freeze(Array.from({length:3},(_,i)=>Object.freeze({x:LOUNGE.x+LOUNGE.sofaX-LOUNGE.width/2+.20+(i+.5)*(LOUNGE.width-.40)/3,z:LOUNGE.z+LOUNGE.sofaZ+LOUNGE.sitZ,yaw:0,seatY:LOUNGE.seatY,floorY:LOUNGE.floorY})));
export const CHARGE_PODS=Object.freeze(Array.from({length:4},(_,i)=>Object.freeze({x:1.15+i*1.38,z:-5.5,floorY:.3745,radius:.44,ceilingY:2.105})));
export const ENERGY=Object.freeze({x:7,z:-4.7,floorY:.425,innerHalfWidth:.695,innerHalfDepth:.65,ceilingY:2.825});
export const GYM=Object.freeze({x:12.6,z:.65,width:6.8,depth:10,floorY:.065,tableX:12.6,tableZ:-1.45,tableY:.76});
export const SPORT_SLOTS=Object.freeze([
 Object.freeze({kind:'ping-left',x:10.72,z:GYM.tableZ,yaw:Math.PI/2,floorY:GYM.floorY}),
 Object.freeze({kind:'ping-right',x:14.48,z:GYM.tableZ,yaw:-Math.PI/2,floorY:GYM.floorY}),
 Object.freeze({kind:'treadmill',x:10.8,z:3.60,yaw:Math.PI,floorY:.235}),
 Object.freeze({kind:'weights',x:14.3,z:3.60,yaw:Math.PI,floorY:GYM.floorY+.0155})
]);
export function ballAt(t){const u=((t%1.6)+1.6)%1.6/1.6,d=u<.5?u*2:(1-u)*2;let y;
 if(d<.25){const q=d/.25;y=.95-.15*q+.18*4*q*(1-q);}else if(d>.75){const q=(d-.75)/.25;y=.80+.15*q+.18*4*q*(1-q);}else{const q=(d-.25)/.5;y=.80+.34*4*q*(1-q);}
 return {x:10.99+d*3.22,y,z:GYM.tableZ+.18*Math.sin(t*Math.PI*1.25)};}
export function localWorld(p,local){const right={x:Math.cos(p.yaw),z:-Math.sin(p.yaw)},fwd={x:Math.sin(p.yaw),z:Math.cos(p.yaw)};return {x:p.x+right.x*local.x+fwd.x*local.z,y:p.floorY+(local.y||0),z:p.z+right.z*local.x+fwd.z*local.z};}
