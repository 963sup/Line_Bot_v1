export type IntelligenceTextProvider = (input: {
  prompt: string;
  system: string;
}) => Promise<string>;

export function createIntelligenceTextGeneration(provider: IntelligenceTextProvider) {
  return {
    generate(input: { prompt: string; system: string }) {
      return provider(input);
    },
  };
}
