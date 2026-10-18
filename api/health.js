import {getDatabase} from '../server/database.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  const db=await getDatabase();
  if(db)await db.prepare('SELECT 1 AS ok').first();
  res.status(200).json({ok:true,release:'3.6.0',multiplayer:!!db,leaderboards:!!db});
 }catch(error){
  console.error('Breuer database health:',error.name);
  res.status(503).json({ok:false,multiplayer:false});
 }
}
