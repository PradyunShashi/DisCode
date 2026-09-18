function Editor({textContent, setTextContent}:{textContent:string, setTextContent:(value:string)=>void}){
    console.log(textContent)
    return(
        <textarea className = "editor" value={textContent}
        onChange={(e)=> setTextContent(e.target.value)}></textarea>
    )
}

export default Editor