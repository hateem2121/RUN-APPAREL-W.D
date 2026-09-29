import { createRoot } from 'react-dom/client'
import { ContactGlobe } from '../../src/components/site/ContactGlobe'

// The props arrive from the test (`addInitScript`), so one bundle serves every case.
const props = (window as unknown as { __GLOBE_PROPS: { coordinates: string; address: string } })
  .__GLOBE_PROPS
const root = document.getElementById('root')
if (root) createRoot(root).render(<ContactGlobe {...props} />)
