// Shared identities and handling data. Rendering and online validation can
// read the catalogue without importing the track/physics implementation.
export const HANDLING_VERSION='arcade-handling-4';
export const CARS = Object.freeze([
  {id:'kadett',name:'Opel Kadett C',short:'KADETT C',tag:'Der schnelle ;-)',color:0xffc52c,max:34,accel:14,grip:1.02,shape:'coupe',
    handling:{agility:1.04,traction:17.2,steerAttack:14,steerReturn:20,yawResponse:26,settle:13.4,driftAngle:.34,brake:27,downforce:.025,roll:.044,pitch:.036}},
  {id:'e30',name:'AC Schnitzer BMW E30 M3',short:'E30 M3',tag:'Präzision in jeder Kurve.',color:0xeae8df,max:31,accel:12.5,grip:1.22,shape:'box',
    handling:{agility:1,traction:20.2,steerAttack:15,steerReturn:22,yawResponse:28,settle:17.2,driftAngle:.31,brake:29,downforce:.03,roll:.032,pitch:.028}},
  {id:'m1',name:'BMW M1 Procar',short:'M1 PROCAR',tag:'Breit. Tief. Motorsport.',color:0xeae8df,max:35,accel:11.5,grip:1.08,shape:'wedge',
    handling:{agility:.96,traction:19.4,steerAttack:13.5,steerReturn:19,yawResponse:24,settle:15,driftAngle:.32,brake:29.5,downforce:.075,roll:.022,pitch:.022}},
  {id:'m2',name:'BMW M2 Competition',short:'M2 COMPETITION',tag:'Kraftvoll. Direkt. Bereit zum Drift.',color:0x92989d,max:35.5,accel:13.7,grip:1.12,shape:'modern-coupe',
    handling:{agility:.99,traction:18.8,steerAttack:13,steerReturn:19,yawResponse:25,settle:13.8,driftAngle:.36,brake:30,downforce:.035,roll:.034,pitch:.031}},
  {id:'gt3rs',name:'Porsche 911 GT3 RS',short:'911 GT3 RS',tag:'Flügel. Grip. Volle Attacke.',color:0x267ddb,max:37,accel:13.2,grip:1.29,shape:'rs',
    handling:{agility:1.04,traction:23,steerAttack:15.5,steerReturn:22,yawResponse:29,settle:18.5,driftAngle:.29,brake:33,downforce:.12,roll:.016,pitch:.019}}
].map(car=>Object.freeze({...car,handling:Object.freeze(car.handling)})));
