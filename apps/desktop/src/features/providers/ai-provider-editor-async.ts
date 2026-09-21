export type LatestRequestGate = {
  begin: () => number;
  invalidate: () => void;
  isCurrent: (requestSequence: number) => boolean;
};

export const createLatestRequestGate = (): LatestRequestGate => {
  let sequence = 0;
  return {
    begin: () => {
      sequence += 1;
      return sequence;
    },
    invalidate: () => {
      sequence += 1;
    },
    isCurrent: (requestSequence) => requestSequence === sequence,
  };
};
