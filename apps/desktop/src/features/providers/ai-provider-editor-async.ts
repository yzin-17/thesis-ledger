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

export type SingleFlightGate = {
  tryBegin: () => boolean;
  end: () => void;
};

export const createSingleFlightGate = (): SingleFlightGate => {
  let active = false;
  return {
    tryBegin: () => {
      if (active) return false;
      active = true;
      return true;
    },
    end: () => {
      active = false;
    },
  };
};
