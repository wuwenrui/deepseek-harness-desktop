import '../shared/theme.css'
import './style.css'
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import type { CompatibilityChromeBridge, CompatibilityChromeState } from '../../compatibility-chrome-contract.ts'

declare global { interface Window { desktopChrome: CompatibilityChromeBridge } }

function Chrome() {
  const [state, setState] = useState<CompatibilityChromeState>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const off = window.desktopChrome.subscribe(setState)
    void window.desktopChrome.invoke('state').then(value => { if (value) setState(value) }).catch(() => setFailed(true))
    return off
  }, [])
  const chinese = state?.locale !== 'en'
  return <header className="dshDesktopFrameTitlebar" data-platform={state?.platform} data-material="off">
    <span className="lawyerDesktopSeal">律</span>
    <span className="lawyerDesktopTitle">{chinese ? '律衡' : 'LawyerDesk'}</span>
    <span className="lawyerDesktopCaption">LawyerDesk</span>
    <button type="button" className="lawyerDesktopRestart" onClick={() => { void window.desktopChrome.invoke('restart').catch(() => setFailed(true)) }}>{chinese ? '重启工作台' : 'Restart'}</button>
    {failed && <span role="alert">{chinese ? '操作未完成' : 'Operation failed'}</span>}
  </header>
}
const root = document.getElementById('root')
if (root === null) throw new Error('lawyer-desktop: missing native chrome root')
createRoot(root).render(<Chrome />)
