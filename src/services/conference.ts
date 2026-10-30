import type { Repository } from '@/data/repository';
import { reconcile } from '@/domain/reconciliation';

/**
 * Executa (ou reexecuta) a conferência de um cupom: carrega o carrinho da compra (se houver),
 * o cupom revisado, as associações manuais e as resoluções anteriores; grava o relatório.
 */
export async function runConference(repo: Repository, receiptId: string): Promise<string> {
  const receipt = await repo.getReceipt(receiptId);
  if (!receipt) throw new Error('Cupom não encontrado');
  const purchase = await repo.getPurchase(receipt.purchaseId);
  const cart = purchase && purchase.mode === 'cart' ? await repo.listCartItems(purchase.id) : null;
  const report = reconcile(cart, receipt.parsed, {
    manualMatches: receipt.manualMatches,
    manualUnmatched: receipt.manualUnmatched,
    resolutions: await repo.getResolutions(receiptId),
  });
  const reportId = await repo.saveReport(receipt.purchaseId, receiptId, report);
  if (purchase && purchase.status === 'active') await repo.updatePurchase(purchase.id, { status: 'checked' });
  return reportId;
}
