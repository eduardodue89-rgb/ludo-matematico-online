const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6 });
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const COLORS = ['Mantua','Riese','Venecia','Treviso'];
const ROUTE = [[6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
const STARTS = [0,13,26,39];

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.json({ok:true, rooms:rooms.size}));

function code(){ let c; do c=Math.random().toString(36).slice(2,8).toUpperCase(); while(rooms.has(c)); return c; }
function publicRoom(room){ return {code:room.code,maxPlayers:room.maxPlayers,started:room.started,players:room.players.map(p=>({id:p.id,name:p.name,color:p.color,ready:p.ready,connected:p.connected}))}; }
function broadcast(room){ io.to(room.code).emit('room-state', publicRoom(room)); }
function initialGame(count){ return {current:0,value:null,awaitingMove:false,tokens:Array.from({length:count},(_,p)=>Array.from({length:4},(_,n)=>({p,n,pos:-1}))),winner:null,pendingQuestion:null}; }
function gameState(room){ const g=room.game; return {current:g.current,value:g.value,awaitingMove:g.awaitingMove,tokens:g.tokens,winner:g.winner,pendingQuestion:g.pendingQuestion?{id:g.pendingQuestion.id,player:g.pendingQuestion.player}:null}; }
function safeQuestions(data){
  const fallback={customCellQuestions:{},skillQuestions:[]};
  if(!data||typeof data!=='object') return fallback;
  const out={customCellQuestions:{},skillQuestions:Array.isArray(data.skillQuestions)?data.skillQuestions.slice(0,20):[]};
  for(const [key,bank] of Object.entries(data.customCellQuestions||{})) if(Array.isArray(bank)) out.customCellQuestions[key]=bank.slice(0,20).map(q=>({q:String(q.q||'').slice(0,1000),a:Array.isArray(q.a)?q.a.slice(0,4).map(x=>String(x).slice(0,300)):[],ok:Number(q.ok)||0,image:typeof q.image==='string'&&q.image.length<700000?q.image:''}));
  out.skillQuestions=out.skillQuestions.map(q=>({q:String(q.q||'').slice(0,1000),a:Array.isArray(q.a)?q.a.slice(0,4).map(x=>String(x).slice(0,300)):[],ok:Number(q.ok)||0,image:typeof q.image==='string'&&q.image.length<700000?q.image:''}));
  return out;
}
function defaultBank(course,cell){
  const n=cell+2;
  if(course===0)return[{q:`¿Cuánto vale x si x + ${n} = ${n+7}?`,a:[`${n+5}`,'7',`${n+7}`,`${n+9}`],ok:1},{q:`¿Cuánto vale x si 2x = ${2*n}?`,a:[`${n-1}`,`${n}`,`${n+1}`,`${2*n}`],ok:1},{q:`¿Cuánto vale x si x − ${n} = 5?`,a:['5',`${n}`,`${n+5}`,`${n+4}`],ok:2},{q:`Si x = ${n}, ¿cuánto es x + 3?`,a:[`${n+2}`,`${n+3}`,`${n+4}`,`${n*3}`],ok:1}];
  if(course===1){const factor=2+(cell%8);return[{q:`¿Cuánto es ${factor} × 7?`,a:[`${factor*6}`,`${factor*7}`,`${factor*8}`,`${factor+7}`],ok:1},{q:`¿Cuál es la mitad de ${2*n}?`,a:[`${n-1}`,`${n}`,`${n+1}`,`${2*n}`],ok:1},{q:`¿Cuánto es ${n+10} + ${n}?`,a:[`${2*n+8}`,`${2*n+10}`,`${2*n+12}`,`${n+10}`],ok:1},{q:`¿Cuánto es ${3*n} ÷ 3?`,a:[`${n-1}`,`${n}`,`${n+1}`,`${3*n}`],ok:1}]}
  if(course===2){const sides=3+(cell%6);return[{q:`¿Cuántos lados tiene un polígono de ${sides} lados?`,a:[`${sides-1}`,`${sides}`,`${sides+1}`,'0'],ok:1},{q:'¿Cuánto suman los ángulos de un triángulo?',a:['90°','180°','270°','360°'],ok:1},{q:'Un cuadrado tiene lados…',a:['todos iguales','todos diferentes','curvos','ninguno'],ok:0},{q:'¿Cuántos vértices tiene un rectángulo?',a:['3','4','5','6'],ok:1}]}
  const angles=[30,45,60,90],angle=angles[cell%4];return[{q:`¿Cuál es el complemento de ${angle}°?`,a:[`${90-angle}°`,`${180-angle}°`,`${angle}°`,'360°'],ok:0},{q:'¿Cuánto vale cos(0°)?',a:['0','1','1/2','-1'],ok:1},{q:'¿Cuál de estos es un ángulo recto?',a:['45°','60°','90°','180°'],ok:2},{q:'¿Cuántos grados tiene una vuelta completa?',a:['180°','270°','360°','90°'],ok:2}];
}
function bankFor(room,course,cell){ const key=`${course}-${cell}`; return room.questions.customCellQuestions[key]||defaultBank(course,cell); }
function skillBank(room){ return room.questions.skillQuestions.length?room.questions.skillQuestions:[{q:'¿Cuánto es 2 + 2?',a:['3','4','5','6'],ok:1},{q:'¿Cuánto es 5 × 3?',a:['8','15','18','20'],ok:1},{q:'¿Cuál es la mitad de 20?',a:['5','10','15','20'],ok:1},{q:'¿Cuántos grados tiene una vuelta completa?',a:['90°','180°','270°','360°'],ok:3}]; }
function pickQuestion(room,t){
  const isSkill=t.pos===58;
  const cell=isSkill?null:(STARTS[t.p]+t.pos)%52;
  const course=isSkill?null:Math.floor(cell/13);
  const bank=isSkill?skillBank(room):bankFor(room,course,cell);
  if(!bank.length) return null;
  const item=bank[Math.floor(Math.random()*bank.length)];
  return {id:Math.random().toString(36).slice(2,10),q:item.q,a:item.a,ok:Number(item.ok)||0,image:item.image||'',player:t.p,token:t.n,oldPos:null,six:false};
}
function spot(t){
  const homes=[[[2,2],[2,4],[4,2],[4,4]],[[2,10],[2,12],[4,10],[4,12]],[[10,10],[10,12],[12,10],[12,12]],[[10,2],[10,4],[12,2],[12,4]]];
  const lanes=[[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],[[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],[[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]];
  if(t.pos<0)return homes[t.p][t.n]; if(t.pos<52)return ROUTE[(STARTS[t.p]+t.pos)%52]; if(t.pos<58)return lanes[t.p][t.pos-52]; return [7,7];
}
function capture(room,t){ const at=spot(t); if(t.pos>=52)return; const routeIndex=(STARTS[t.p]+t.pos)%52; if(STARTS.includes(routeIndex))return; for(const list of room.game.tokens){ for(const o of list){ if(o!==t&&o.p!==t.p&&o.pos>=0&&o.pos<52){const os=spot(o);if(os[0]===at[0]&&os[1]===at[1])o.pos=-1;}}}}
function finishServerMove(room,pidx,ti,correct){
  const g=room.game,p=room.players[pidx],pq=g.pendingQuestion,t=g.tokens[pidx][ti];
  if(correct) { t.pos=pq.nextPos; capture(room,t); } else t.pos=pq.oldPos;
  const dice=pq.dice;
  const reached=t.pos===58;
  g.pendingQuestion=null; g.value=null; g.awaitingMove=false;
  if(correct&&reached) g.winner=pidx;
  if(g.winner===null && (!correct || dice!==6)) g.current=(g.current+1)%room.players.length;
  io.to(room.code).emit('game-state',{state:gameState(room),event:{type:'answer',player:pidx,token:ti,correct,newPos:t.pos,dice,winner:g.winner}});
}

io.on('connection',socket=>{
  socket.on('create-room',({name,maxPlayers=2}={},ack=()=>{})=>{ name=String(name||'Jugador').trim().slice(0,24)||'Jugador'; maxPlayers=Math.max(2,Math.min(4,Number(maxPlayers)||2)); const c=code(); const room={code:c,maxPlayers,started:false,host:socket.id,players:[],game:null,questions:safeQuestions(null)}; room.players.push({id:socket.id,name,color:COLORS[0],ready:true,connected:true}); rooms.set(c,room); socket.join(c); socket.data.room=c; ack({ok:true,code:c,color:COLORS[0],playerIndex:0}); broadcast(room); });
  socket.on('join-room',({name,code:c}={},ack=()=>{})=>{c=String(c||'').trim().toUpperCase();name=String(name||'Jugador').trim().slice(0,24)||'Jugador';const room=rooms.get(c);if(!room)return ack({ok:false,error:'No existe esa sala.'});if(room.started)return ack({ok:false,error:'La partida ya comenzó.'});if(room.players.length>=room.maxPlayers)return ack({ok:false,error:'La sala está llena.'});const idx=room.players.length;room.players.push({id:socket.id,name,color:COLORS[idx],ready:true,connected:true});socket.join(c);socket.data.room=c;ack({ok:true,code:c,color:COLORS[idx],playerIndex:idx});broadcast(room);});
  socket.on('start-online',({code:c,questionData}={},ack=()=>{})=>{const room=rooms.get(String(c||'').toUpperCase());if(!room)return ack({ok:false,error:'Sala no encontrada.'});if(room.host!==socket.id)return ack({ok:false,error:'Solo el creador puede iniciar la partida.'});if(room.players.length<2)return ack({ok:false,error:'Se necesitan al menos 2 jugadores.'});room.questions=safeQuestions(questionData);room.started=true;room.game=initialGame(room.players.length);io.to(room.code).emit('game-start',{state:gameState(room),players:room.players.map(x=>({name:x.name,color:x.color}))});ack({ok:true});});
  socket.on('roll-request',({code:c}={},ack=()=>{})=>{
    const room=rooms.get(String(c||'').toUpperCase());
    if(!room||!room.started)return ack({ok:false,error:'Partida no iniciada.'});
    const idx=room.players.findIndex(x=>x.id===socket.id),g=room.game;
    if(idx!==g.current||g.awaitingMove||g.value!==null||g.pendingQuestion||g.winner!==null)return ack({ok:false,error:'No es tu turno.'});
    const n=Math.floor(Math.random()*6)+1;
    g.value=n;
    g.awaitingMove=true;
    const legalTokens=g.tokens[idx].filter(t=>{
      if(t.pos<0)return n===6;
      return t.pos<58 && t.pos+n<=58;
    });
    io.to(room.code).emit('dice-result',{value:n,current:g.current,noMove:legalTokens.length===0,state:gameState(room)});
    ack({ok:true,value:n,noMove:legalTokens.length===0});
    if(legalTokens.length===0){
      setTimeout(()=>{
        const r=rooms.get(room.code);
        if(!r||!r.game||r.game.current!==idx||r.game.value!==n||!r.game.awaitingMove)return;
        r.game.value=null;
        r.game.awaitingMove=false;
        r.game.current=(r.game.current+1)%r.players.length;
        io.to(r.code).emit('game-state',{state:gameState(r),event:{type:'no-move',player:idx,dice:n,nextPlayer:r.game.current}});
      },700);
    }
  });
  socket.on('move-request',({code:c,tokenIndex}={},ack=()=>{})=>{const room=rooms.get(String(c||'').toUpperCase());if(!room||!room.started)return ack({ok:false,error:'Partida no iniciada.'});const idx=room.players.findIndex(x=>x.id===socket.id),g=room.game;if(idx!==g.current||!g.awaitingMove||g.value===null||g.pendingQuestion)return ack({ok:false,error:'Movimiento no permitido.'});const ti=Number(tokenIndex),t=g.tokens[idx]?.[ti];if(!t)return ack({ok:false,error:'Ficha inválida.'});const value=g.value,old=t.pos;if(old<0&&value!==6)return ack({ok:false,error:'Necesitas un 6 para sacar una ficha.'});const next=old<0?0:old+value;if(next>58)return ack({ok:false,error:'Esa ficha no puede avanzar.'});const routeIndex=next>=0&&next<52?(STARTS[idx]+next)%52:null;const needsQuestion=next===58||(next>=0&&next<52&&!STARTS.includes(routeIndex));if(needsQuestion){const q=pickQuestion(room,t);if(q){q.oldPos=old;q.nextPos=next;q.six=value===6;q.dice=value;g.pendingQuestion=q;io.to(room.code).emit('question-request',{question:{id:q.id,q:q.q,a:q.a,image:q.image},player:idx,state:gameState(room)});return ack({ok:true,question:true});}}
g.value=null;g.awaitingMove=false;if(next===58)g.winner=idx;if(g.winner===null&&value!==6)g.current=(g.current+1)%room.players.length;io.to(room.code).emit('game-state',{state:gameState(room),event:{type:'move',player:idx,token:ti,oldPos:old,newPos:next,dice:value,winner:g.winner}});ack({ok:true});});
  socket.on('answer-request',({code:c,questionId,answerIndex}={},ack=()=>{})=>{const room=rooms.get(String(c||'').toUpperCase());if(!room||!room.started||!room.game.pendingQuestion)return ack({ok:false,error:'No hay una pregunta pendiente.'});const idx=room.players.findIndex(x=>x.id===socket.id),q=room.game.pendingQuestion;if(idx!==q.player||String(questionId)!==String(q.id))return ack({ok:false,error:'No puedes responder esta pregunta.'});const correct=Number(answerIndex)===Number(q.ok);finishServerMove(room,idx,q.token,correct);ack({ok:true,correct});});
  socket.on('disconnect',()=>{const c=socket.data.room;if(!c)return;const room=rooms.get(c);if(!room)return;const p=room.players.find(x=>x.id===socket.id);if(p)p.connected=false;broadcast(room);if(room.players.every(x=>!x.connected))setTimeout(()=>{const r=rooms.get(c);if(r&&r.players.every(x=>!x.connected))rooms.delete(c)},60000);});
});
server.listen(PORT,()=>console.log(`Ludo Matemático online: http://localhost:${PORT}`));
