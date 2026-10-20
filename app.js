/* Configure these two values in your Supabase project. Never put a service_role key here. */
const SUPABASE_URL = "COLE_AQUI_A_URL_DO_PROJETO";
const SUPABASE_ANON_KEY = "COLE_AQUI_A_CHAVE_ANON_PUBLICA";

const $ = (id) => document.getElementById(id);
const setupWarning = $("setup-warning");
const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("COLE_AQUI") && SUPABASE_ANON_KEY.length > 30 && !SUPABASE_ANON_KEY.includes("COLE_AQUI");
let supabase = null, currentUser = null, authMode = "login", activePostId = null, postChannel = null, chatChannel = null;

const safeText = (value) => String(value ?? "");
const escapeHtml = (value) => safeText(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const setMessage = (id, text, success=false) => { const el=$(id); el.textContent=text; el.classList.toggle("success",success); };
const friendlyError = (error) => {
  const m = safeText(error?.message).toLowerCase();
  if (m.includes("already registered") || m.includes("already exists") || m.includes("duplicate")) return "Este e-mail já está cadastrado ou não pode ser usado. Tente entrar ou recuperar a senha.";
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("password") && (m.includes("weak") || m.includes("short"))) return "Escolha uma senha mais forte, com pelo menos 10 caracteres.";
  if (m.includes("rate limit") || m.includes("too many requests")) return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  if (m.includes("network") || m.includes("fetch")) return "Falha de conexão. Verifique sua internet e tente novamente.";
  return "Não foi possível concluir a operação. Confira os dados e tente novamente.";
};

function setAuthMode(mode) {
  authMode=mode;
  $("login-tab").classList.toggle("active",mode==="login");
  $("signup-tab").classList.toggle("active",mode==="signup");
  $("auth-submit").textContent=mode==="login"?"Entrar":"Criar conta";
  $("password-hint").classList.toggle("hidden",mode!=="signup");
  $("password").autocomplete=mode==="login"?"current-password":"new-password";
  setMessage("auth-message","");
}
$("login-tab").addEventListener("click",()=>setAuthMode("login"));
$("signup-tab").addEventListener("click",()=>setAuthMode("signup"));

async function init() {
  if (!configured || !window.supabase) {
    setupWarning.classList.remove("hidden");
    setupWarning.textContent="Configuração necessária: crie um projeto Supabase, execute schema.sql no SQL Editor e preencha SUPABASE_URL e SUPABASE_ANON_KEY no arquivo app.js. A chave service_role nunca deve ser usada no navegador.";
    $("auth-submit").disabled=true;
    return;
  }
  supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
    auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}
  });
  const {data:{session}}=await supabase.auth.getSession();
  await onSession(session);
  supabase.auth.onAuthStateChange((_event,session)=>{ setTimeout(()=>onSession(session),0); });
}
async function onSession(session) {
  currentUser=session?.user || null;
  $("auth-view").classList.toggle("hidden",!!currentUser);
  $("app-view").classList.toggle("hidden",!currentUser);
  $("logout-btn").classList.toggle("hidden",!currentUser);
  $("session-label").textContent=currentUser?"Conta autenticada":"Você não está conectado";
  if (currentUser) {
    $("profile-email").textContent=currentUser.email || "Usuário";
    $("avatar").textContent=(currentUser.email||"C").slice(0,1).toUpperCase();
    await loadFeed();
    await loadChat();
    subscribeRealtime();
  } else {
    if(postChannel) supabase?.removeChannel(postChannel);
    if(chatChannel) supabase?.removeChannel(chatChannel);
    $("feed-list").innerHTML='<div class="empty-state">Entre para ver as publicações.</div>';
  }
}
$("auth-form").addEventListener("submit",async e=>{
  e.preventDefault(); if(!supabase)return;
  const email=$("email").value.trim().toLowerCase();
  const password=$("password").value;
  if(!email || !password){setMessage("auth-message","Informe e-mail e senha.");return;}
  if(authMode==="signup" && password.length<10){setMessage("auth-message","A senha precisa ter pelo menos 10 caracteres.");return;}
  $("auth-submit").disabled=true; setMessage("auth-message","Processando…");
  try {
    if(authMode==="signup"){
      const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}});
      if(error)throw error;
      if(data.session) setMessage("auth-message","Conta criada com sucesso!",true);
      else setMessage("auth-message","Cadastro iniciado. Verifique sua caixa de entrada para confirmar o e-mail.",true);
    } else {
      const {error}=await supabase.auth.signInWithPassword({email,password}); if(error)throw error;
      setMessage("auth-message","Login realizado.",true);
    }
  } catch(err){setMessage("auth-message",friendlyError(err));}
  finally{$("auth-submit").disabled=false;}
});
$("reset-password").addEventListener("click",async()=>{
  if(!supabase)return;
  const email=$("email").value.trim().toLowerCase();
  if(!email){setMessage("auth-message","Digite seu e-mail acima para receber as instruções.");return;}
  try{
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
    if(error)throw error;
    setMessage("auth-message","Se a conta existir, você receberá instruções de recuperação.",true);
  }catch(e){setMessage("auth-message",friendlyError(e));}
});
$("logout-btn").addEventListener("click",async()=>{
  const {error}=await supabase.auth.signOut(); if(error) alert(friendlyError(error));
});
$("post-image").addEventListener("change",()=>{
  const f=$("post-image").files[0];
  $("image-name").textContent=f?`${f.name} · ${(f.size/1024/1024).toFixed(1)} MB`:"JPG, PNG ou WebP · até 5 MB";
});
$("post-form").addEventListener("submit",async e=>{
  e.preventDefault(); if(!currentUser)return;
  const content=$("post-content").value.trim(), file=$("post-image").files[0];
  if(!content && !file){setMessage("post-message","Escreva algo ou selecione uma imagem.");return;}
  if(content.length>3000){setMessage("post-message","O texto excede o limite de 3.000 caracteres.");return;}
  if(file && file.size>5*1024*1024){setMessage("post-message","A imagem deve ter no máximo 5 MB.");return;}
  const allowed={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
  if(file && !allowed[file.type]){setMessage("post-message","Formato não permitido. Use JPG, PNG ou WebP.");return;}
  const btn=e.submitter; btn.disabled=true; setMessage("post-message","Publicando…");
  try{
    let image_url=null;
    if(file){
      // Re-encode/inspect images on the server for production; MIME and size checks here are only a first layer.
      const ext=allowed[file.type], path=`${currentUser.id}/${crypto.randomUUID()}.${ext}`;
      const {error:uploadError}=await supabase.storage.from("post-images").upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw uploadError;
      const {data}=supabase.storage.from("post-images").getPublicUrl(path);
      image_url=data.publicUrl;
    }
    const {error}=await supabase.from("posts").insert({user_id:currentUser.id,content,image_url});
    if(error)throw error;
    $("post-content").value="";$("post-image").value="";$("image-name").textContent="JPG, PNG ou WebP · até 5 MB";
    setMessage("post-message","Publicação criada!",true);await loadFeed();
  }catch(err){setMessage("post-message",friendlyError(err));}
  finally{btn.disabled=false;}
});
$("refresh-btn").addEventListener("click",loadFeed);
document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b===btn));
  $("feed-view").classList.toggle("hidden",btn.dataset.view!=="feed");
  $("chat-view").classList.toggle("hidden",btn.dataset.view!=="chat");
  if(btn.dataset.view==="chat")loadChat();
}));
function formatDate(date){return new Date(date).toLocaleString("pt-BR",{dateStyle:"medium",timeStyle:"short"});}
async function loadFeed(){
  if(!currentUser)return;
  const {data:posts,error}=await supabase.from("posts").select("id,user_id,content,image_url,created_at").order("created_at",{ascending:false}).limit(50);
  if(error){$("feed-list").innerHTML='<div class="empty-state">Não foi possível carregar o feed. Tente atualizar.</div>';return;}
  if(!posts?.length){$("feed-list").innerHTML='<div class="empty-state">Ainda não há publicações. Seja a primeira pessoa a compartilhar uma ideia.</div>';return;}
  const ids=posts.map(p=>p.id);
  const {data:comments}=await supabase.from("comments").select("post_id").in("post_id",ids);
  const counts={};(comments||[]).forEach(c=>counts[c.post_id]=(counts[c.post_id]||0)+1);
  $("feed-list").innerHTML=posts.map(p=>`
    <article class="post-card">
      <div class="post-head"><div class="post-avatar">${escapeHtml((p.user_id===currentUser.id?(currentUser.email||"C"):"M").slice(0,1).toUpperCase())}</div>
      <div class="post-meta"><strong>${p.user_id===currentUser.id?"Você":"Membro da comunidade"}</strong><time>${escapeHtml(formatDate(p.created_at))}</time></div>
      ${p.user_id===currentUser.id?'<button class="action-btn delete-post" data-id="'+escapeHtml(p.id)+'" type="button">Excluir</button>':""}</div>
      ${p.content?`<p class="post-content">${escapeHtml(p.content)}</p>`:""}
      ${p.image_url?`<img class="post-image" loading="lazy" src="${escapeHtml(p.image_url)}" alt="Imagem publicada pela comunidade" referrerpolicy="no-referrer">`:""}
      <div class="post-actions"><button class="action-btn comment-open" data-id="${escapeHtml(p.id)}" type="button">◌ ${counts[p.id]||0} comentários</button></div>
    </article>`).join("");
  $("feed-list").querySelectorAll(".comment-open").forEach(b=>b.addEventListener("click",()=>openComments(b.dataset.id)));
  $("feed-list").querySelectorAll(".delete-post").forEach(b=>b.addEventListener("click",()=>deletePost(b.dataset.id)));
}
async function deletePost(id){
  if(!confirm("Excluir esta publicação? Esta ação não pode ser desfeita."))return;
  const {error}=await supabase.from("posts").delete().eq("id",id);
  if(error)alert(friendlyError(error));else loadFeed();
}
async function openComments(postId){
  activePostId=postId;$("comment-content").value="";setMessage("comment-message","");
  await loadComments();$("comments-dialog").showModal();
}
async function loadComments(){
  const {data,error}=await supabase.from("comments").select("id,user_id,content,created_at").eq("post_id",activePostId).order("created_at",{ascending:true}).limit(100);
  if(error){$("comments-list").textContent="Não foi possível carregar os comentários.";return;}
  $("comments-list").innerHTML=data?.length?data.map(c=>`<div class="comment"><strong>${c.user_id===currentUser.id?"Você":"Membro"} · ${escapeHtml(formatDate(c.created_at))}</strong>${escapeHtml(c.content)}</div>`).join(""):'<div class="empty-state">Seja a primeira pessoa a comentar.</div>';
}
$("close-comments").addEventListener("click",()=>$("comments-dialog").close());
$("comment-form").addEventListener("submit",async e=>{
  e.preventDefault();const content=$("comment-content").value.trim();
  if(!content||!activePostId)return;
  const {error}=await supabase.from("comments").insert({post_id:activePostId,user_id:currentUser.id,content});
  if(error){setMessage("comment-message",friendlyError(error));return;}
  $("comment-content").value="";setMessage("comment-message","Comentário publicado.",true);await loadComments();await loadFeed();
});
$("chat-form").addEventListener("submit",async e=>{
  e.preventDefault();const content=$("chat-input").value.trim();if(!content)return;
  const btn=e.submitter;btn.disabled=true;
  try{
    const {error}=await supabase.from("chat_messages").insert({user_id:currentUser.id,content});
    if(error)throw error;
    $("chat-input").value="";setMessage("chat-message","Mensagem enviada.",true);await loadChat();
  }catch(err){setMessage("chat-message",friendlyError(err));}
  finally{btn.disabled=false;}
});
async function loadChat(){
  if(!currentUser)return;
  const {data,error}=await supabase.from("chat_messages").select("id,user_id,content,created_at").order("created_at",{ascending:true}).limit(100);
  if(error){$("chat-messages").innerHTML='<div class="empty-state">Configure as políticas de acesso e a tabela de mensagens no banco.</div>';return;}
  $("chat-messages").innerHTML=data?.length?data.map(m=>`<div class="chat-bubble ${m.user_id===currentUser.id?"mine":""}"><small>${m.user_id===currentUser.id?"Você":"Membro"} · ${escapeHtml(formatDate(m.created_at))}</small>${escapeHtml(m.content)}</div>`).join(""):'<div class="empty-state">Comece a conversa com uma mensagem.</div>';
  $("chat-messages").scrollTop=$("chat-messages").scrollHeight;
}
function subscribeRealtime(){
  if(postChannel)supabase.removeChannel(postChannel);
  if(chatChannel)supabase.removeChannel(chatChannel);
  postChannel=supabase.channel("posts-updates").on("postgres_changes",{event:"*",schema:"public",table:"posts"},()=>loadFeed()).subscribe();
  chatChannel=supabase.channel("chat-updates").on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_messages"},()=>loadChat()).subscribe();
}
init();
