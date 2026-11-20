import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setLanguage } from '../src/i18n';
import {
  CaseActions,
  InteractionActions,
  KycDocEdit,
  PlanActions,
  TotalLand,
  matchesActivity,
  NO_FILTER,
  parsePlanLines,
  planLinesText,
  type LandPlot,
} from '../src/features/customers/Parity17';

const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
let mockMe: { userId: string; roles: string[]; permissions?: string[] };
let mockId = 0;
jest.mock('../src/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'signedIn',
    me: mockMe,
    client: {
      get: jest.fn(),
      post: (...a: unknown[]) => mockPost(...a),
      patch: (...a: unknown[]) => mockPatch(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
    },
  }),
}));
jest.mock('../src/device', () => ({ newId: () => `key-${++mockId}` }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(async () => {
  [mockPost, mockPatch, mockDelete].forEach((m) => m.mockReset().mockResolvedValue({}));
  mockId = 0;
  mockMe = { userId: 'u-1', roles: [], permissions: undefined };
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retryDelay: 0 } } });
  await setLanguage('en');
});

describe('rules like the web', () => {
  test('plan lines: item | qty | needed by, one per line, with the line of the first problem', () => {
    expect(parsePlanLines('Urea | 10 | 2026-12-01\n\nDAP|2.5')).toEqual({
      lines: [
        { description: 'Urea', qty: '10', neededBy: '2026-12-01' },
        { description: 'DAP', qty: '2.5' },
      ],
    });
    expect(parsePlanLines('Urea | 0')).toEqual({ error: 'qty', line: 1 });
    expect(parsePlanLines('Urea | 1\n | 2')).toEqual({ error: 'item', line: 2 });
    expect(parsePlanLines('Urea | 1 | 1/12/26')).toEqual({ error: 'date', line: 1 });
    expect(parsePlanLines('  ')).toEqual({ error: 'none', line: 0 });
    expect(planLinesText([{ description: 'Urea', qty: '10', neededBy: null }])).toBe('Urea | 10');
  });
  test('activity filter: words, kind and an open-ended date range', () => {
    const call = { kind: 'CALL', date: '2026-11-10T09:00:00Z', text: ['Asked about urea price', null] };
    expect(matchesActivity(NO_FILTER, call)).toBe(true);
    expect(matchesActivity({ ...NO_FILTER, q: 'UREA' }, call)).toBe(true);
    expect(matchesActivity({ ...NO_FILTER, kind: 'VISIT' }, call)).toBe(false);
    expect(matchesActivity({ ...NO_FILTER, from: '2026-11-11' }, call)).toBe(false);
    expect(matchesActivity({ ...NO_FILTER, to: '2026-11-10' }, call)).toBe(true);
  });
});

describe('calls and visits', () => {
  const x = { id: 'i1', notes: 'Spoke about pests', cropIssue: null, advice: null };
  test('correct: notes, issue, advice and the reason; the original stays on record', async () => {
    await render(<InteractionActions customerId="c1" x={x} />, { wrapper });
    await fireEvent.press(screen.getByText('Correct this entry'));
    await fireEvent.changeText(screen.getByLabelText('Crop issue seen'), 'Aphids');
    await fireEvent.press(screen.getByText('Save'));
    expect(mockPatch).not.toHaveBeenCalled(); // no reason yet
    await fireEvent.changeText(screen.getByLabelText('Why is it being corrected?'), 'Wrong crop issue');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/customers/c1/interactions/i1', {
        body: { notes: 'Spoke about pests', cropIssue: 'Aphids', advice: '', reason: 'Wrong crop issue' },
        idempotencyKey: 'key-1',
      }),
    );
  });
  test('delete marks it as made in error, with a reason', async () => {
    await render(<InteractionActions customerId="c1" x={x} />, { wrapper });
    await fireEvent.press(screen.getByText('Delete'));
    expect(screen.getByText(/never erased/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reason (recorded)'), 'Logged twice');
    await fireEvent.press(screen.getByText('Mark as made in error'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/customers/c1/interactions/i1/void', {
        body: { reason: 'Logged twice' },
        idempotencyKey: 'key-1',
      }),
    );
  });
  test('a struck-out entry offers nothing; a role without the right sees no buttons', async () => {
    const r = await render(
      <InteractionActions customerId="c1" x={{ ...x, voided: true, correctionReason: 'Logged twice' }} />,
      { wrapper },
    );
    expect(screen.getByText('Made in error: Logged twice')).toBeTruthy();
    r.unmount();
  });
  test('no right, no buttons', async () => {
    mockMe = { userId: 'u-2', roles: [], permissions: ['customer.view'] };
    await render(<InteractionActions customerId="c1" x={x} />, { wrapper });
    expect(screen.queryByText('Correct this entry')).toBeNull();
  });
});

describe('service cases', () => {
  const x = {
    id: 'k1',
    caseNo: 'SC-7',
    adviceText: null,
    adviceSource: null,
    adviceReference: null,
    outcome: null,
    version: 4,
  };
  test('update sends only the filled boxes, with the version', async () => {
    await render(<CaseActions customerId="c1" x={x} />, { wrapper });
    await fireEvent.press(screen.getByText('Update case SC-7'));
    await fireEvent.changeText(screen.getByLabelText('Advice'), 'Spray neem oil');
    await fireEvent.press(screen.getByText('An expert told us'));
    await fireEvent.changeText(screen.getByLabelText('Expert name or document'), 'Dr Patil');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/customers/c1/service-cases/k1', {
        body: { adviceText: 'Spray neem oil', adviceSource: 'EXPERT_PROVIDED', adviceReference: 'Dr Patil' },
        version: 4,
        idempotencyKey: 'key-1',
      }),
    );
  });
  test('delete voids it with the reason and the version', async () => {
    await render(<CaseActions customerId="c1" x={x} />, { wrapper });
    await fireEvent.press(screen.getByText('Delete case SC-7'));
    await fireEvent.changeText(screen.getByLabelText('Reason (recorded)'), 'Wrong farmer');
    await fireEvent.press(screen.getByText('Mark as made in error'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/customers/c1/service-cases/k1/void', {
        body: { reason: 'Wrong farmer' },
        version: 4,
        idempotencyKey: 'key-1',
      }),
    );
  });
});

describe('KYC document details', () => {
  test('type and expiry; the number only when typed', async () => {
    await render(<KycDocEdit customerId="c1" d={{ id: 'd1', docType: 'PAN', expiresOn: null }} />, {
      wrapper,
    });
    await fireEvent.press(screen.getByText('Edit document details'));
    await fireEvent.press(screen.getByText('Voter ID'));
    await fireEvent.changeText(screen.getByLabelText('Expires on'), '2030-01-31');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/customers/c1/documents/d1', {
        body: { docType: 'VOTER_ID', expiresOn: '2030-01-31' },
        idempotencyKey: 'key-1',
      }),
    );
  });
});

describe('purchase plans', () => {
  const draft = {
    id: 'p1',
    season: 'RABI',
    seasonYear: 2026,
    status: 'DRAFT',
    version: 2,
    lines: [{ description: 'Urea', qty: '10', neededBy: null }],
  };
  test('edit a draft: season, year and the item lines, with the version', async () => {
    await render(<PlanActions customerId="c1" x={draft} seasons={['KHARIF', 'RABI']} />, { wrapper });
    await fireEvent.press(screen.getByText('Edit draft'));
    await fireEvent.changeText(screen.getByDisplayValue('Urea | 10'), 'Urea | 12\nDAP | 5 | 2026-12-15');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/customers/c1/purchase-plans/p1', {
        body: {
          season: 'RABI',
          seasonYear: 2026,
          lines: [
            { description: 'Urea', qty: '12' },
            { description: 'DAP', qty: '5', neededBy: '2026-12-15' },
          ],
        },
        version: 2,
        idempotencyKey: 'key-1',
      }),
    );
  });
  test('delete a draft', async () => {
    await render(<PlanActions customerId="c1" x={draft} seasons={['RABI']} />, { wrapper });
    await fireEvent.press(screen.getByText('Delete draft'));
    await fireEvent.press(screen.getByText('Delete draft plan'));
    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith('/customers/c1/purchase-plans/p1', { idempotencyKey: 'key-1' }),
    );
  });
  test('a confirmed plan is closed, not deleted; a closed one offers nothing', async () => {
    const r = await render(
      <PlanActions customerId="c1" x={{ ...draft, status: 'CONFIRMED' }} seasons={['RABI']} />,
      { wrapper },
    );
    expect(screen.queryByText('Edit draft')).toBeNull();
    await fireEvent.press(screen.getByText('Close plan'));
    await fireEvent.press(screen.getAllByText('Close plan').at(-1)!);
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/customers/c1/purchase-plans/p1/status', {
        body: { status: 'CLOSED' },
        idempotencyKey: 'key-1',
      }),
    );
    r.unmount();
  });
});

describe('total land', () => {
  const farm = (plots: LandPlot[]) => [{ status: 'ACTIVE', plots }];
  test('no plot yet: records a "Main plot"', async () => {
    await render(<TotalLand customerId="c1" farms={farm([])} />, { wrapper });
    await fireEvent.press(screen.getByText('Add land details'));
    await fireEvent.changeText(screen.getByLabelText('Land holding'), '2.5');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/customers/c1/plots', {
        body: { name: 'Main plot', areaValue: '2.5', areaUnit: 'ACRE' },
        idempotencyKey: 'key-1',
      }),
    );
  });
  test('one plot: its area changes, with the version', async () => {
    await render(
      <TotalLand
        customerId="c1"
        farms={farm([
          { id: 'pl1', name: 'North', status: 'ACTIVE', areaValue: '3.00', areaUnit: 'ACRE', version: 5 },
        ])}
      />,
      { wrapper },
    );
    await fireEvent.press(screen.getByText('Edit total land'));
    await fireEvent.changeText(screen.getByDisplayValue('3'), '4');
    await fireEvent.press(screen.getByText('hectare'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/customers/c1/plots/pl1', {
        body: { areaValue: '4', areaUnit: 'HECTARE' },
        version: 5,
        idempotencyKey: 'key-1',
      }),
    );
  });
  test('several plots: changed one by one', async () => {
    await render(
      <TotalLand
        customerId="c1"
        farms={farm([
          { id: 'a', name: 'A', status: 'ACTIVE' },
          { id: 'b', name: 'B', status: 'ACTIVE' },
        ])}
      />,
      { wrapper },
    );
    expect(screen.getByText('This customer has several plots: change them one by one.')).toBeTruthy();
  });
});
