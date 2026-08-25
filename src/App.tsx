import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/electron-vite.animate.svg'
import Editor from './components/editor.tsx'
import File_explorer from './components/file_explorer.tsx'
import Terminal from './components/terminal.tsx'
import Topbar from './components/topbar.tsx'
import Tab_bar from './components/tab_bar.tsx'

import './App.css'

function App() {

  const[filesInFolder,setFilesInFolder] = useState<{
    name: string,
    path: string,
    isDirectory: boolean,
  }[]>([])

  return (
   <>
   <div className = "app">
    <Topbar 
    setFilesInFolder={setFilesInFolder}
    />
    <div className="workspace">
    <File_explorer filesInFolder={filesInFolder}/>
    <div className = "editor-terminal">
      <Tab_bar />
      <Editor />
      <Terminal />
    </div>
    </div>
   </div>
   </>
  )
}

export default App
