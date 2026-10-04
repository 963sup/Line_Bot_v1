export type RichMenuDefinition = {
  size: { width: number; height: number };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: Array<{
    bounds: { x: number; y: number; width: number; height: number };
    action:
      | { type: "uri"; label: string; uri: string }
      | { type: "postback"; label: string; data: string }
      | { type: "richmenuswitch"; label: string; richMenuAliasId: string; data: string };
  }>;
};
