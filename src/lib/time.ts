/**
 * Instante atual da requisição. Usado em Server Components (renderizados uma vez por requisição),
 * onde ler o relógio é seguro; centralizado aqui para ficar explícito e fácil de simular em testes.
 */
export function requestNow(): number {
  return Date.now();
}
