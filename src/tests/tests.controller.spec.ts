import { localizeTestSseData } from './tests.controller';

describe('localizeTestSseData', () => {
  const progress = {
    stage: 'started',
    message: 'Generating individual Jest test',
    detail: { attempt: 1 },
  };

  it('localizes test progress for a Korean SSE request', () => {
    expect(localizeTestSseData(progress, 'ko')).toEqual({
      ...progress,
      message: '개별 Jest 테스트 생성',
      messageKey: 'Generating individual Jest test',
    });
  });

  it('keeps the canonical message for an English SSE request', () => {
    expect(localizeTestSseData(progress, 'en')).toBe(progress);
  });

  it('does not change result payloads without a message', () => {
    const result = { verified: true };
    expect(localizeTestSseData(result, 'ko')).toBe(result);
  });
});
