import { journalEvidenceFixture } from '../../../packages/schemas/test/fixtures/journal-review.fixture.js';

export const journalUiEvidenceFixture = () => {
  const input = journalEvidenceFixture();
  input.trade.sourceQuantity = '2.000000000000000001';
  return input;
};
