/**
 * The RUN mark as the loaders draw it: N°009 Loom Weave, the one direction the owner chose (29 Oct
 * 2026). Five bands, laid from alternating sides. Band heights overlap by 40 units when drawn, so two
 * soft clip edges meeting leave no hairline (filmed 30 Oct).
 */
export const LOOM_MARK_VIEWBOX = '0 0 8000 2767'

export const LOOM_MARK_PATHS = [
  'M2722,0 L0,0 L4,755 L1927,755 L1929,758 L1928,1836 L6,1837 L9,2766 L994,2766 L2722,1082 Z',
  'M2141,1837 L1928,2045 L1928,2766 L2722,2766 L2722,1837 Z',
  'M5743,0 L4700,0 L4700,2010 L4698,2012 L3936,2011 L3936,88 L2959,1040 L2959,2766 L3964,2766 L5723,1052 L5743,1031 Z',
  'M7999,0 L6995,0 L5248,1702 L5215,1736 L5215,2766 L6259,2766 L6258,757 L6260,755 L7031,756 L7032,2766 L7999,1761 Z',
] as const

/** Each band's top and height, in the viewBox's units. */
export const LOOM_MARK_BANDS = [
  [0, 554],
  [554, 554],
  [1108, 554],
  [1662, 554],
  [2216, 551],
] as const
