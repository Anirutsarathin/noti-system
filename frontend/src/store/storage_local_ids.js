export function genId(){
  const rand = Math.random().toString(16).slice(2, 8);
  return `UI-${Date.now()}-${rand}`;
}
