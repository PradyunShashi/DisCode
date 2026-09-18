import { fileEntry, tab} from '../types.ts'
import { useState } from 'react'

function File_explorer({filesInFolder,setActiveTab,tabs,setTabs}:{filesInFolder:fileEntry[],setActiveTab:(path:string)=>void,tabs:Record<string,tab>,setTabs:React.Dispatch<React.SetStateAction<Record<string,tab>>>}){
    const [expandedFolder, setExpandedFolder] = useState<string[]>([]);
    const [folderContents, setFolderContents] = useState<Record<string, fileEntry[]>>({});
    function renderFiles(files:fileEntry[],depth = 0)
    {
        return files.map(file=>(
                <div key = {file.path} style = {{marginLeft: `${depth*5}px`}}>
                   <button className = "fileNameButton" onClick={()=>fileClicker(file)}>{file.name}</button>
                   {
                    file.isDirectory&&
                    expandedFolder.includes(file.path)&&
                    folderContents[file.path]&&(
                        <div className = "childrenFiles">
                            {renderFiles(folderContents[file.path],depth+1)}
                        </div>)
                   }
                </div>
            ))
    } 
    async function fileClicker(file:fileEntry)
    {
        if(file.isDirectory)
        {
            if(expandedFolder.includes(file.path)){
                setExpandedFolder(expandedFolder.filter(path=>path!=file.path))
                return null;
            }
            else {
                setExpandedFolder([...expandedFolder,file.path]);
                const entries = await window.api.openDirectory(file.path);
                console.log(entries);
                setFolderContents({...folderContents,[file.path]:entries})
            }
        }
        else{
            let content = await window.api.readFile(file.path);
            setTabs(prevTabs => ({
                ...prevTabs,
                [file.path]:{
                    tabName:file.name,
                    content: content
                }
            }));
            setActiveTab(file.path);
        };
    }
    return (
        <div className = "file_explorer">
            {renderFiles(filesInFolder)}
        </div>
    )
}

export default File_explorer