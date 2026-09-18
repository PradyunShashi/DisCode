import { useState, useEffect} from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/electron-vite.animate.svg'
import Editor from './components/editor.tsx'
import File_explorer from './components/file_explorer.tsx'
import Terminal from './components/terminal.tsx'
import Topbar from './components/topbar.tsx'
import Tab_bar from './components/tab_bar.tsx'
import {tab} from './types.ts'

import './App.css'

function App() {

  //takes the files from the user for clicking the file button
  const[filesInFolder,setFilesInFolder] = useState<{
    name: string,
    path: string,
    isDirectory: boolean,
  }[]>([])

  const[textContent, setTextContent] = useState<string>("");

  const[tabs, setTabs] = useState<Record<string, tab>>({});

  const [activeTab, setActiveTab] = useState<string>("");

  const currentTab = tabs[activeTab];

  // called when Editor content changes
  function handleEditorChange(newContent: string) {
      setTabs(prevTabs => ({
          ...prevTabs,
          [activeTab]: {
              ...prevTabs[activeTab],
              content: newContent
          }
      }))
  }
  
  // Ctrl+S
async function saveFile() {
    if (!activeTab) return
    await window.api.writeFile(activeTab, currentTab.content)
}

useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
        if (e.ctrlKey && e.key === "s") {
            e.preventDefault()
            saveFile()
        }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
}, [activeTab, tabs])
    

  return (
   <>
   <div className = "app">
    <Topbar 
    setFilesInFolder={setFilesInFolder}
    />

    <div className="workspace">
    <File_explorer 
    filesInFolder={filesInFolder}
    tabs = {tabs}
    setTabs = {setTabs}
    setActiveTab = {setActiveTab}/>

    <div className = "editor-terminal">
      <Tab_bar 
      tabs = {tabs}
      setActiveTab = {setActiveTab}
      setTabs = {setTabs}/>

      <Editor 
      textContent = {currentTab?.content ?? ""}
      setTextContent = {handleEditorChange}
      />
      <Terminal />
    </div>
    </div>
   </div>
   </>
  )

}

export default App
