type WeightUnit = 'lbs' | 'kg';

export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight;
  
  if (from === 'lbs' && to === 'kg') {
    return weight / 2.20462;
  }
  
  if (from === 'kg' && to === 'lbs') {
    return weight * 2.20462;
  }
  
  return weight;
}

export function formatWeight(weight: number, userUnit?: WeightUnit): { value: string; unit: string } {
  const unit = userUnit || 'lbs';
  
  const roundedWeight = Math.round(weight * 10) / 10;
  
  return {
    value: roundedWeight.toLocaleString(undefined, { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 1 
    }),
    unit: unit,
  };
}

export function getWeightDisplay(weightInLbs: number, userUnit?: WeightUnit): string {
  const unit = userUnit || 'lbs';
  
  if (unit === 'kg') {
    const kg = convertWeight(weightInLbs, 'lbs', 'kg');
    return `${Math.round(kg * 10) / 10} kg`;
  }
  
  return `${Math.round(weightInLbs * 10) / 10} lbs`;
}
