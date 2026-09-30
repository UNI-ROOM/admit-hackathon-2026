export interface Session { user: { id: string; nickname: string; email: string | null; isGuest: boolean }; progress: { max_level: number; tutorial_done: number }; best: Record<string, number> }
export interface RunPayload { levelId: number; timeLeftMs: number; echoesUsed: number; deaths: number; resets: number }
export interface BoardRow { nickname: string; total: number; levels: number; isMe: boolean }
export interface Rank { rank: number | null; total: number; levels: number; players: number }
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
 const response = await fetch('/api' + path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
 const data = await response.json();
 if (!response.ok) throw new Error(data.error || 'request_failed');
 return data;
}
export const api = {
 session: () => request<Session>('/session','POST'),
 me: () => request<Session>('/me'),
 requestCode: (email:string) => request('/auth/request','POST',{email}),
 verify: (email:string,code:string) => request<Session>('/auth/verify','POST',{email,code}),
 logout: () => request('/auth/logout','POST'),
 nickname: (nickname:string) => request<Session>('/me','PATCH',{nickname}),
 run: (p:RunPayload) => request<{score:number;best:number;rank:number}>('/runs','POST',p),
 progress: (p:{maxLevel?:number;tutorialDone?:boolean}) => request('/progress','PUT',p),
 leaderboard: () => request<BoardRow[]>('/leaderboard?limit=10'),
 rank: () => request<Rank>('/me/rank','GET'),
};
