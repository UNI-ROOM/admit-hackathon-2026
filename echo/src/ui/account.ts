import { api, type Session, type RunPayload } from '../api';
import { levelScore, LEVEL_ECHOES, maxEchoesForLevel } from '../../../shared/score';
import { t } from '../i18n';
import { onChange } from '../scenes/router';
let session: Session | null = null;
let online = false;
const hud = document.createElement('aside'); hud.className = 'account-hud';
const identity = document.createElement('span');
const status = document.createElement('span');
const panel = document.createElement('dialog'); panel.className = 'account-panel';
document.body.append(hud, panel);
onChange(scene => { hud.hidden = scene !== 'menu'; });
function button(text:string, action:()=>void) { const b=document.createElement('button');b.textContent=text;b.type='button';b.dataset.dwell='';b.onclick=action;return b; }
const login=button(t('account.signIn'),()=>auth());
const nickname=button(t('account.nickname'),()=>editNickname());
const logout=button(t('account.signOut'),()=>{ void (async()=>{try{await api.logout();session=await api.session();online=true;render();}catch{offline();}})(); });
hud.append(identity,status,login,nickname,logout,button(t('account.leaderboard'),()=>{void board();}));
export function offline(){online=false;render();}
function render(){identity.textContent=session?t('account.identityPts',{name:session.user.nickname,total:Object.values(session.best).reduce((a,b)=>a+b,0)}):t('account.identityFallback');status.textContent=online?'':t('account.offline');login.hidden=!!session&&!session.user.isGuest;logout.hidden=!session||session.user.isGuest;nickname.hidden=!session;}
function open(title:string){panel.replaceChildren();const h=document.createElement('h2');h.textContent=title;panel.append(h,button(t('account.close'),()=>panel.close()));if(!panel.open)panel.showModal();}
function message(text:string){const p=document.createElement('p');p.textContent=text;panel.append(p);return p;}
function errorText(e:unknown){const code=e instanceof Error?e.message:'';return ({rate_limited:t('account.error.rateLimited'),invalid_code:t('account.error.invalidCode'),mail_unavailable:t('account.error.mailUnavailable'),invalid_input:t('account.error.invalidInput')} as Record<string,string>)[code]||t('account.error.default');}
function auth(){
 open(t('account.authTitle'));
 const form=document.createElement('form'); const email=document.createElement('input');email.type='email';email.required=true;email.placeholder=t('account.emailPlaceholder');email.autocomplete='email';
 const code=document.createElement('input');code.placeholder=t('account.codePlaceholder');code.inputMode='numeric';code.pattern='[0-9]{6}';code.maxLength=6;code.autocomplete='one-time-code';code.hidden=true;
 const submit=document.createElement('button');submit.textContent=t('account.getCode');submit.type='submit';
 const feedback=document.createElement('p');form.append(email,code,submit,feedback);panel.append(form);
 const again=button(t('account.changeEmail'),()=>auth());again.hidden=true;panel.append(again);
 let sent=false;
 form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;feedback.textContent='';try{
  if(!session){session=await api.session();}
  if(!sent){await api.requestCode(email.value);sent=true;email.readOnly=true;code.hidden=false;code.required=true;again.hidden=false;submit.textContent=t('account.signIn');code.focus();feedback.textContent=t('account.codeSent');}
  else{session=await api.verify(email.value,code.value);online=true;render();panel.close();}
 }catch(err){feedback.textContent=errorText(err);}finally{submit.disabled=false;}};
}
function editNickname(){open(t('account.nicknameTitle'));const form=document.createElement('form');const input=document.createElement('input');input.minLength=2;input.maxLength=16;input.required=true;input.value=session?.user.nickname||'';const submit=document.createElement('button');submit.type='submit';submit.textContent=t('account.save');const feedback=document.createElement('p');form.append(input,submit,feedback);panel.append(form);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{session=await api.nickname(input.value);online=true;render();panel.close();}catch(err){feedback.textContent=errorText(err);}finally{submit.disabled=false;}};}
async function fillBoard(container:HTMLElement){try{const rows=await api.leaderboard();const table=document.createElement('table');const head=table.createTHead().insertRow();for(const text of [t('account.tableHash'),t('account.tablePlayer'),t('account.tableScore'),t('account.tableLevels')]){const th=document.createElement('th');th.textContent=text;head.append(th);}const body=table.createTBody();rows.forEach((r,i)=>{const row=body.insertRow();if(r.isMe)row.className='is-me';for(const value of [i+1,r.nickname,r.total,r.levels])row.insertCell().textContent=String(value);});container.append(table);if(!rows.length){const p=document.createElement('p');p.textContent=t('account.noResults');container.append(p);}}catch{const p=document.createElement('p');p.textContent=t('account.leaderboardUnavailable');container.append(p);}}
async function board(){open(t('account.top10'));const container=document.createElement('div');panel.append(container);await fillBoard(container);await appendYouRank(container);}
async function appendYouRank(container:HTMLElement){try{const r=await api.rank();const p=document.createElement('p');p.textContent=r.rank?t('board.you',{rank:r.rank,total:r.total}):t('board.youNoRank');container.append(p);}catch{/* offline: skip */}}
export async function initializeAccount(){try{session=await api.session();online=true;render();return session;}catch{offline();return null;}}
export async function refreshSession(){try{session=await api.session();online=true;}catch{offline();}render();return session;}
export async function saveProgress(p:{maxLevel?:number;tutorialDone?:boolean}){try{await api.progress(p);}catch{offline();}}
export function openProfile(){
 open(t('profile.title'));
 const total=session?Object.values(session.best).reduce((a,b)=>a+b,0):0;
 message(session?session.user.email||t('profile.guest'):t('profile.guest'));
 message(t('profile.totalPoints',{total}));
 for(let n=1;n<=LEVEL_ECHOES.length;n++){const best=session?.best[String(n)];message(`${t('profile.level',{n})}: ${best?t('profile.best',{score:best}):t('profile.noBest')}`);}
 const rankMsg=message(t('profile.noRank'));
 void (async()=>{try{const r=await api.rank();rankMsg.textContent=r.rank?t('profile.rank',{rank:r.rank,players:r.players}):t('profile.noRank');}catch{/* offline: keep default */}})();
 panel.append(login,nickname,logout,button(t('profile.close'),()=>panel.close()));
}
export function openLeaderboard(){void board();}
export async function showResult(p:RunPayload,next:()=>void,replay?:()=>void){
 const score=levelScore({...p,maxEchoes:maxEchoesForLevel(p.levelId,p.difficulty)});open(t('account.levelComplete',{score}));
 const summary=message(t('account.savingResult'));
 let seconds=8;let timer:ReturnType<typeof setInterval>|null=null;
 const countdown=message(t('result.nextIn',{s:seconds}));
 const stopCountdown=()=>{if(timer){clearInterval(timer);timer=null;}};
 const nextBtn=button(t('result.next'),()=>{stopCountdown();next();});
 const replayBtn=button(t('result.replay'),()=>{stopCountdown();(replay||next)();});
 const levelsBtn=button(t('result.levelSelect'),()=>{stopCountdown();panel.close();void import('../scenes/router').then(m=>m.show('levels'));});
 panel.append(nextBtn,replayBtn,levelsBtn);
 timer=setInterval(()=>{seconds-=1;if(seconds<=0){stopCountdown();next();return;}countdown.textContent=t('result.nextIn',{s:seconds});},1000);
 const container=document.createElement('div');panel.append(container);
 try{if(!session)session=await api.session();const r=await api.run(p);summary.textContent=t('account.bestRank',{best:r.best,rank:r.rank});session=await api.me();online=true;render();}catch{summary.textContent=t('account.offlineNotSaved');offline();}
 await fillBoard(container);
}
export function closePanel(){panel.close();}
export function panelOpen(){return panel.open;}
render();

