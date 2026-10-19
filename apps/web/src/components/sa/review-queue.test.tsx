import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Review } from '@semanticauth/contracts';
import { PurchaseReviewDialog } from './review-queue';
import { review } from '@/test/fixtures';

function dialog(value: Review, client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <PurchaseReviewDialog review={value} />
    </QueryClientProvider>
  );
}
describe('review confirmation snapshot', () => {
  it('keeps the reviewed quote stable and blocks decisions until changed terms are acknowledged', async () => {
    const client = new QueryClient();
    const changed = { ...review, offer: { ...review.offer, amount: '200000' } };
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ...changed, status: 'approved' }), { status: 200 }),
      );
    const view = render(dialog(review, client));
    await userEvent.click(screen.getByRole('button', { name: 'Review purchase' }));
    view.rerender(dialog(changed, client));
    expect(screen.getByRole('button', { name: 'Approve purchase' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Reject' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('0.100001')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Load latest offer' }));
    expect(screen.getByText('0.20')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Approve purchase' }));
    expect(fetch).toHaveBeenCalledWith(
      `/api/reviews/${review.id}/approve`,
      expect.objectContaining({ method: 'POST' }),
    );
    client.clear();
  });
  it('disables an expired confirmation without waiting for a polling response', async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    try {
      render(dialog({ ...review, expiresAt: new Date(Date.now() + 1000).toISOString() }, client));
      fireEvent.click(screen.getByRole('button', { name: 'Review purchase' }));
      expect(
        screen.getByRole('button', { name: 'Approve purchase' }).hasAttribute('disabled'),
      ).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1001);
      });
      expect(
        screen.getByRole('button', { name: 'Approve purchase' }).hasAttribute('disabled'),
      ).toBe(true);
      expect(screen.getByText('This review has expired.')).toBeTruthy();
    } finally {
      client.clear();
      vi.useRealTimers();
    }
  });
});
