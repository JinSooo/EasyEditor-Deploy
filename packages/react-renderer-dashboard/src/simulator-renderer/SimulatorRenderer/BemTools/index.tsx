import type { Simulator } from '@easy-editor/core'
import { observer } from 'mobx-react'
import { BorderDetecting } from './BorderDetecting'
import { BorderResizing } from './BorderResizing'
import { BorderSelecting } from './BorderSelecting'
import { GuideLine } from './Guideline'

import './index.css'
import './tools.css'

interface BemToolsProps {
  host: Simulator
}

export const BemTools: React.FC<BemToolsProps> = observer(({ host }) => {
  const { designMode } = host

  if (designMode === 'live') {
    return null
  }

  return (
    <div className='lc-bem-tools'>
      <BorderDetecting host={host} />
      <BorderSelecting host={host} />
      <BorderResizing host={host} />

      <GuideLine host={host} />
    </div>
  )
})
