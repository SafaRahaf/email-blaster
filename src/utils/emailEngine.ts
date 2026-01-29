
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getRandomDelay = (minSeconds: number, maxSeconds: number) => {
  const min = minSeconds * 1000;
  const max = maxSeconds * 1000;
  // If min is greater than max, swap them
  const actualMin = Math.min(min, max);
  const actualMax = Math.max(min, max);
  return Math.floor(Math.random() * (actualMax - actualMin + 1) + actualMin);
};

export interface Sender {
  id: string;
  email: string;
  password: string;
  weight: number;
  active: boolean;
  name?: string;
}

export const selectSender = (senders: Sender[]) => {
  const activeSenders = senders.filter((s) => s.active && s.email && s.password);
  
  if (activeSenders.length === 0) return null;

  // Weighted Random Algorithm
  const weightedPool: Sender[] = [];
  
  activeSenders.forEach((sender) => {
    // Default weight 1 if not specified or invalid
    const weight = sender.weight && sender.weight > 0 ? Math.floor(sender.weight) : 1;
    for (let i = 0; i < weight; i++) {
      weightedPool.push(sender);
    }
  });

  if (weightedPool.length === 0) return activeSenders[Math.floor(Math.random() * activeSenders.length)];

  const randomIndex = Math.floor(Math.random() * weightedPool.length);
  return weightedPool[randomIndex];
};

export const getCurrentTimestamp = () => {
  const now = new Date();
  return {
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString('en-US', { hour12: false }), // 00:00:00 format
  };
};
