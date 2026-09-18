import {tab} from '../types.ts'

function Tabbar({tabs, setActiveTab, setTabs}:{tabs:Record<string,tab>, setActiveTab:(path:string)=>void, setTabs:React.Dispatch<React.SetStateAction<Record<string,tab>>>}){    function deleteTab(filePath:string)
    {
        setTabs(prevTabs => {
            const newTabs = { ...prevTabs }
            delete newTabs[filePath]
            return newTabs
        })

    }
    return(
        <div className="tab_bar">
            {Object.entries(tabs).map(([filePath, tabData]) => (
                <div key={filePath} className="tab">
                    <button className = "tabName" onClick={() => setActiveTab(filePath)}>
                        {tabData.tabName}
                    </button>
                    <button className = "closeTab" onClick={(e) => { e.stopPropagation(); deleteTab(filePath) }}>X</button>
                </div>
            ))}
        </div>
    )
}

export default Tabbar