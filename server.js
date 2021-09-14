require('dotenv').config()
const express = require('express')
const app = express()

const PORT = process.env.PORT || 5000
const faunadb = require ('faunadb')
const cors = require('cors')

const adminClient = new faunadb.Client({ secret: process.env.ADMINKEY })

const client = new faunadb.Client({ 
    secret: process.env.SERVERSECRET,
    domain: 'db.us.fauna.com',
    scheme: 'https' 
})

// import Fauna Query Functions
const q = faunadb.query;


// start server
app.use(cors())
app.use(express.json())
app.listen(PORT, () => console.log(`API on port: ${PORT}`))

// TEST ROUTE
app.get("/", async (req,res) => {
    const data = "hello world!"
    res.json(data)
})

// LOGIN ROUTE
app.get("/login", async (req,res) => {
    const pass = req.body.password
    const email = req.body.email

    const data = await client.query(
        q.Login(
            q.Match(q.Index("users_by_email"), email), { password: pass }
        )
    ).catch(err => res.json(err))
    res.json( {"token": data.secret, "user-ref": data.instance.id} )
})

// CREATE NEW USER
app.post("/newuser", async (req,res) => {

    const pass = req.body.password
    const email = req.body.email

    const data = await client.query(
        q.Create(q.Collection("Users"), {
        credentials: { 
            password: pass 
        },
        data: {
            email: email,
            name: "",
            groups: {},
            profile_gm: {},
            profile_pc: {}
        }
    })
    ).catch (err => res.json(err))
    console.log('New User Created!')
    console.log(data)

    const login = await client.query(
        q.Login(
            q.Match(q.Index("users_by_email"), email), { password: pass }
        )
    )
    res.json( {"token": login.secret, "user-ref": login.instance.id} )
})

// SIGNED IN USER SECTION
// after this, every route needs the following line:
/*
    const client = new faunadb.Client({ secret: req.token })
*/
// likewise, frontend must send the token with every request