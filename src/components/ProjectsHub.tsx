import { useState } from 'react'
import { ProjectFinancePlanner } from './ProjectFinancePlanner'
import { ProjectsScreen } from './ProjectsScreen'

export function ProjectsHub() {
  const [revision, setRevision] = useState(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ProjectsScreen key={revision} />
      <ProjectFinancePlanner onChanged={() => setRevision(value => value + 1)} />
    </div>
  )
}
