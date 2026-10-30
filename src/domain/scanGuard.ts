/**
 * Distingue a repetição técnica de uma leitura (a câmera continua vendo o mesmo código
 * e dispara o evento várias vezes por segundo) de uma nova leitura intencional.
 *
 * Regra:
 *  - Leituras do mesmo código dentro de `technicalWindowMs` após a última detecção dele
 *    são "repetição técnica" e são ignoradas. Enquanto o código continuar visível a janela
 *    é renovada, então segurar o produto diante da câmera nunca adiciona outra unidade.
 *  - Depois que o código sai de vista por mais que a janela, uma nova leitura é intencional.
 *    Se o produto já está no carrinho, a interface pede confirmação antes de somar.
 *  - Inclusões manuais (código digitado) nunca são tratadas como repetição técnica.
 */

export type ScanDecision =
  | { kind: 'technical_repeat'; code: string }
  | { kind: 'new'; code: string }
  | { kind: 'already_in_cart'; code: string };

export type ScanEventType =
  | 'scan_new'
  | 'scan_technical_repeat'
  | 'scan_intentional_repeat'
  | 'manual_entry'
  | 'quantity_increment_confirmed'
  | 'scan_cancelled'
  | 'scan_corrected'
  | 'item_removed'
  | 'quantity_changed';

export interface ScanGuardOptions {
  /** Janela para considerar a leitura como repetição técnica. */
  technicalWindowMs?: number;
  /** Intervalo mínimo entre quaisquer duas leituras aceitas (códigos diferentes). */
  minIntervalMs?: number;
}

export class ScanGuard {
  private lastSeen = new Map<string, number>();
  private lastAcceptedAt = -Infinity;
  private readonly technicalWindowMs: number;
  private readonly minIntervalMs: number;

  constructor(opts: ScanGuardOptions = {}) {
    this.technicalWindowMs = opts.technicalWindowMs ?? 2500;
    this.minIntervalMs = opts.minIntervalMs ?? 600;
  }

  /**
   * Avalia uma detecção da câmera.
   * @param isInCart função que informa se o código já está no carrinho.
   */
  evaluateCameraRead(code: string, now: number, isInCart: (code: string) => boolean): ScanDecision {
    const prev = this.lastSeen.get(code);
    this.lastSeen.set(code, now);
    if (prev !== undefined && now - prev < this.technicalWindowMs) {
      return { kind: 'technical_repeat', code };
    }
    if (now - this.lastAcceptedAt < this.minIntervalMs) {
      // Outro código lido logo após uma leitura aceita: provavelmente vários códigos no quadro.
      // Tratar como técnico evita adicionar o produto vizinho por engano.
      return { kind: 'technical_repeat', code };
    }
    this.lastAcceptedAt = now;
    return isInCart(code) ? { kind: 'already_in_cart', code } : { kind: 'new', code };
  }

  /** Código digitado manualmente: nunca é repetição técnica. */
  evaluateManual(code: string, now: number, isInCart: (code: string) => boolean): ScanDecision {
    this.lastSeen.set(code, now);
    this.lastAcceptedAt = now;
    return isInCart(code) ? { kind: 'already_in_cart', code } : { kind: 'new', code };
  }

  /** Mantém a janela ativa enquanto um diálogo está aberto e o código segue visível. */
  touch(code: string, now: number) {
    this.lastSeen.set(code, now);
  }

  reset() {
    this.lastSeen.clear();
    this.lastAcceptedAt = -Infinity;
  }
}

export function decisionToEvent(decision: ScanDecision, manual: boolean): ScanEventType {
  if (decision.kind === 'technical_repeat') return 'scan_technical_repeat';
  if (manual) return 'manual_entry';
  if (decision.kind === 'already_in_cart') return 'scan_intentional_repeat';
  return 'scan_new';
}
