// Traduz erros do banco em mensagens para o usuário (usado no servidor e no navegador).

const MESSAGES: Record<string, string> = {
  CONFLITO: "Este cartão foi alterado por outra pessoa enquanto você editava. Mostramos a versão mais recente — revise e tente de novo.",
  CARTAO_INEXISTENTE: "Este cartão não existe mais (talvez tenha sido excluído por outra pessoa).",
  COLUNA_INVALIDA: "Coluna inválida para este quadro.",
  POSICAO_INVALIDA: "Posição inválida. Atualize o quadro e tente de novo.",
  SEM_PERMISSAO: "Seu papel neste espaço não permite esta ação.",
  CONVITE_INVALIDO: "Convite inválido, expirado ou já utilizado.",
  CONVITE_OUTRO_EMAIL: "Este convite foi enviado para outro e-mail. Entre com a conta convidada.",
  JA_E_MEMBRO: "Essa pessoa já faz parte do espaço.",
  PAPEL_INVALIDO: "Papel inválido para convite (apenas o dono pode convidar administradores).",
  NAO_AUTENTICADO: "Sua sessão expirou. Entre novamente.",
};

export const GENERIC_ERROR = "Não foi possível concluir a ação. Tente novamente em instantes.";

export function friendlyDbError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return GENERIC_ERROR;
  const key = Object.keys(MESSAGES).find((k) => error.message?.includes(k));
  if (key) return MESSAGES[key];
  if (error.code === "23503") return "Referência inválida (o responsável precisa ser membro do espaço).";
  if (error.code === "23505") return "Já existe um registro com esse nome.";
  if (error.code === "42501" || error.message?.includes("row-level security")) return MESSAGES.SEM_PERMISSAO;
  return GENERIC_ERROR;
}

export function isConflict(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message?.includes("CONFLITO"));
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  user_already_exists: "Já existe uma conta com este e-mail.",
  weak_password: "Senha fraca. Use ao menos 8 caracteres, com letras e números.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  over_email_send_rate_limit: "Muitos e-mails enviados. Aguarde alguns minutos e tente novamente.",
};

export function friendlyAuthError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return GENERIC_ERROR;
  return (error.code && AUTH_MESSAGES[error.code]) || GENERIC_ERROR;
}
