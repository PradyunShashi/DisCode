import { fileEntry } from '../types.ts'
import { useState } from 'react'

function File_explorer({filesInFolder}:{filesInFolder:fileEntry[]}){
    const [expandedFolder, setExpandedFolder] = useState<string[]>([]);
    const [folderContents, setFolderContents] = useState<Record<string, fileEntry[]>>({});
    function renderFiles(files:fileEntry[],depth = 0)
    {
        return files.map(file=>(
                <div key = {file.path} style = {{marginLeft: `${depth*20}px`}}>
                   <button className = "fileNameButton" onClick={()=>fileClicker(file)}>{file.name}</button>
                   {
                    file.isDirectory&&
                    expandedFolder.includes(file.path)&&
                    folderContents[file.path]&&
                    renderFiles(folderContents[file.path],depth+1)
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
        else return null;
    }
    return (
        <div className = "file_explorer">
            {renderFiles(filesInFolder)}
        </div>
    )
}

export default File_explorer