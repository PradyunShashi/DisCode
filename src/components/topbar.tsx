import { fileEntry } from '../types.ts'



function Topbar({setFilesInFolder}:{ setFilesInFolder: React.Dispatch<React.SetStateAction<fileEntry[]>>})
{
    async function fileButton(){
        console.log("button clicked");
        const folderPath = await window.api.openFolder();
        if(!folderPath) return;
        const entries = await window.api.openDirectory(folderPath);
        setFilesInFolder(entries);
    console.log(entries);
    }
    return(
        <div className = "topbar">
            <button onClick={fileButton}>File</button>
            <button>Edit</button>
            <button>Run</button>
            <button>Terminal</button>
        </div>

    )
}

export default Topbar