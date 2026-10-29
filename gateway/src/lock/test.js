import fs from "fs"


fs.readFile("./files/file1.txt", "utf-8", (err, data)=>{
    console.log("file contents: ", data)
})


import express from 'express'

const app = express()

app.get("/skja/", (req, res)=>{

})

app.listen(1000, ()=>{
    console.log("listening to port 1000")
})

