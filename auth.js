/* Telas de login, cadastro, recuperação e redefinição de senha */
(function () {
  'use strict';
  const { sb, alerta, traduzErro, setLoading, nextUrl } = window.App;
  const $ = (s) => document.querySelector(s);
  const msg = $('#mensagem');
  const pagina = document.body.dataset.pagina;

  /** Erros que o Supabase devolve no endereço (#error=...) quando o link do e-mail falha */
  function erroDoLink() {
    const h = new URLSearchParams(location.hash.slice(1));
    const q = new URLSearchParams(location.search);
    const code = h.get('error_code') || q.get('error_code');
    const desc = h.get('error_description') || q.get('error_description');
    if (!code && !desc) return null;
    if (/otp_expired|expired/i.test(code + desc)) return 'Este link expirou ou já foi usado. Tente entrar: se a conta ainda não estiver confirmada, aparecerá a opção de reenviar o link.';
    return 'Não foi possível validar o link: ' + (desc || code).replace(/\+/g, ' ');
  }

  /** Mostra o bloco "reenviar confirmação" para o e-mail informado */
  function oferecerReenvio(email) {
    const box = $('#reenviar');
    if (!box) return;
    box.classList.remove('hidden');
    const btn = $('#btn-reenviar');
    btn.onclick = async () => {
      setLoading(btn, true, 'Enviando…');
      const { error } = await sb.auth.resend({
        type: 'signup', email, options: { emailRedirectTo: `${location.origin}/login?confirmado=1` },
      });
      setLoading(btn, false);
      if (error) return alerta(msg, traduzErro(error));
      alerta(msg, `Novo link de confirmação enviado para ${email}. Confira também a caixa de spam.`, 'ok');
    };
  }

  /** Se já houver sessão (inclusive vinda do link de confirmação), segue para o painel */
  async function seguirSeLogado() {
    const { data } = await sb.auth.getSession();
    if (data.session) { location.replace(nextUrl()); return true; }
    return false;
  }

  // ---------- LOGIN ----------
  if (pagina === 'login') {
    const erroLink = erroDoLink();
    if (erroLink) alerta(msg, erroLink);
    seguirSeLogado().then((ok) => {
      if (ok || erroLink) return;
      const params = new URLSearchParams(location.search);
      if (params.get('confirmado')) alerta(msg, 'E-mail confirmado! Agora é só entrar.', 'ok');
      if (params.get('senha')) alerta(msg, 'Senha alterada com sucesso. Entre com a nova senha.', 'ok');
    });
    // Sessão criada pelo link de confirmação depois que a página carregou
    sb.auth.onAuthStateChange((evt, session) => {
      if (evt === 'SIGNED_IN' && session) setTimeout(() => location.replace(nextUrl()), 0);
    });

    $('#form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      alerta(msg, '');
      $('#reenviar')?.classList.add('hidden');
      const btn = $('#form-login [type=submit]');
      const email = $('#email').value.trim();
      const password = $('#senha').value;
      if (!email || !password) return alerta(msg, 'Informe e-mail e senha.');
      setLoading(btn, true, 'Entrando…');
      let resp;
      try { resp = await sb.auth.signInWithPassword({ email, password }); }
      catch (err) { resp = { error: err }; }
      setLoading(btn, false);
      if (resp.error) {
        alerta(msg, traduzErro(resp.error));
        if (/not confirmed/i.test(resp.error.message || '')) oferecerReenvio(email);
        return;
      }
      if (!resp.data?.session) return alerta(msg, 'Não foi possível iniciar a sessão. Tente novamente.');
      location.replace(nextUrl());
    });
  }

  // ---------- CADASTRO ----------
  if (pagina === 'cadastro') {
    seguirSeLogado();
    $('#form-cadastro').addEventListener('submit', async (e) => {
      e.preventDefault();
      alerta(msg, '');
      const btn = $('#form-cadastro [type=submit]');
      const nome = $('#nome').value.trim();
      const email = $('#email').value.trim();
      const senha = $('#senha').value;
      const conf = $('#confirmar').value;
      if (nome.length < 2) return alerta(msg, 'Informe seu nome.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return alerta(msg, 'Informe um e-mail válido.');
      if (senha.length < 8) return alerta(msg, 'A senha deve ter pelo menos 8 caracteres.');
      if (senha !== conf) return alerta(msg, 'As senhas não conferem.');

      setLoading(btn, true, 'Criando conta…');
      let resp;
      try {
        resp = await sb.auth.signUp({
          email, password: senha,
          options: { data: { nome }, emailRedirectTo: `${location.origin}/login?confirmado=1` },
        });
      } catch (err) { resp = { error: err }; }
      setLoading(btn, false);
      if (resp.error) return alerta(msg, traduzErro(resp.error));

      // Confirmação de e-mail DESLIGADA no Supabase: já vem com sessão → painel
      if (resp.data.session) return location.replace('/painel');

      // E-mail já cadastrado: o Supabase devolve um usuário sem identidades
      if (resp.data.user && Array.isArray(resp.data.user.identities) && resp.data.user.identities.length === 0) {
        return alerta(msg, 'Este e-mail já está cadastrado. Faça login ou use “Esqueci minha senha”.');
      }

      // Confirmação de e-mail LIGADA: precisa clicar no link
      e.target.classList.add('hidden');
      alerta(msg, `Conta criada! Enviamos um link de confirmação para ${email}. Abra-o neste aparelho para ativar a conta e entrar. Não chegou? Veja o spam ou reenvie.`, 'ok');
      oferecerReenvio(email);
    });
  }

  // ---------- RECUPERAR SENHA ----------
  if (pagina === 'recuperar') {
    $('#form-recuperar').addEventListener('submit', async (e) => {
      e.preventDefault();
      alerta(msg, '');
      const btn = $('#form-recuperar [type=submit]');
      const email = $('#email').value.trim();
      if (!email) return alerta(msg, 'Informe seu e-mail.');
      setLoading(btn, true, 'Enviando…');
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/nova-senha` });
      setLoading(btn, false);
      if (error) return alerta(msg, traduzErro(error));
      alerta(msg, 'Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.', 'ok');
    });
  }

  // ---------- NOVA SENHA (link do e-mail) ----------
  if (pagina === 'nova-senha') {
    const form = $('#form-nova-senha');
    let pronto = false;
    const liberar = () => { if (pronto) return; pronto = true; form.classList.remove('hidden'); alerta(msg, ''); };
    const erroLink = erroDoLink();
    if (erroLink) alerta(msg, erroLink);

    sb.auth.onAuthStateChange((evt, session) => {
      if (evt === 'PASSWORD_RECOVERY' || session) liberar();
    });
    sb.auth.getSession().then(({ data }) => { if (data.session) liberar(); });
    setTimeout(() => {
      if (!pronto && !erroLink) alerta(msg, 'Link inválido ou expirado. Solicite uma nova recuperação de senha.');
    }, 4000);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#form-nova-senha [type=submit]');
      const senha = $('#senha').value;
      if (senha.length < 8) return alerta(msg, 'A senha deve ter pelo menos 8 caracteres.');
      if (senha !== $('#confirmar').value) return alerta(msg, 'As senhas não conferem.');
      setLoading(btn, true, 'Salvando…');
      const { error } = await sb.auth.updateUser({ password: senha });
      setLoading(btn, false);
      if (error) return alerta(msg, traduzErro(error));
      await sb.auth.signOut();
      location.replace('/login?senha=1');
    });
  }
})();
