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
app.post("/login", async (req,res) => {
    const pass = req.body.password
    const email = req.body.email

    const data = await client.query(
        q.Login(
            q.Match(q.Index("users_by_email"), email), { password: pass }
        )
    ).catch(err => res.json(err))
    res.json( {"token": data.secret, "userRef": data.instance.id} )
})


// CREATE NEW USER
app.post("/signup", async (req,res) => {

    const pass = req.body.password
    const email = req.body.email

    const data = await client.query(
        q.Create(q.Collection("Users"), {
        credentials: { 
            password: pass 
        },
        data: {
            email: email,
            name: req.body.name,
            img_profile: "https://i.imgur.com/JYTRwWf.png",
            img_banner: "https://images.unsplash.com/photo-1578377375762-cbcc98d68af0?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=1600&q=80",
            groups: {},
            profile_gm: [{system: "", lfg: true}],
            profile_pc: [{system: "", lfg: true}]
        }
    })
    ).catch (err => res.json(err))
    console.log('New User Created!')
    console.log(data)

    const login = await client.query(
        q.Login(
            q.Match(q.Index("users_by_email"), email), { password: pass }
        )
    ).catch (err => res.json(err))
    res.json( {"token": login.secret, "userRef": login.instance.id} )
})

// SIGNED IN USER SECTION
// after this, every route needs to call the following function:
    const userClient = (authToken) => {
        return new faunadb.Client({ 
            secret: authToken,
            domain: 'db.us.fauna.com',
            scheme: 'https' 
        })
    }
// likewise, frontend must send the token with every request

// LOGOUT ROUTE
app.post("/logout", async (req,res) => {
    const data = await userClient(req.body.token).query(
        q.Logout(true)
    ).catch(err => res.json(err))
    res.json(data)
})

// GET USER PROFILE
app.post("/user/:id", async (req,res) => {
    const response = await userClient(req.body.token).query(
        q.Get(
            q.Ref(q.Collection('Users'), req.params.id)
        )
    ).catch(err => res.json(err))
    res.json( response.data )
})

// UPDATE USER PROFILE
app.put("/user", async (req,res) => {

    const response = await userClient(req.body.userAuth.token).query(
        q.Update(
            q.Ref(q.Collection('Users'), req.body.userAuth.userRef),
            {data: req.body.data}
        )
    ).catch(err => res.json(err))
    res.json(response.data)
})

// CREATE A GROUP
app.post("/group", async (req,res) => {

    const group = req.body.data.formData

    const response = await userClient(req.body.userAuth.token).query(
        q.Create(q.Collection('Groups'), 
            { data: {
                groupName: group.groupName || "",
                gameInfo: group.gameInfo || "",
                groupInfo: group.groupInfo || "",
                bannerImg: group.bannerImg || "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=2734&q=80"
                }
            }
        )
    ).catch(err => res.json(err))
    console.log("Create Group: ", response)
    res.json( response )
})

// GET A GROUP
app.post("/group/:id", async (req,res) => {
    const group = await userClient(req.body.token).query(
        q.Get(
            q.Ref(q.Collection('Groups'), req.params.id)
        )
    ).catch(err => res.json(err))

    let members = await userClient(req.body.token).query(
        q.Map(
            q.Paginate(
                q.Match(
                    q.Index("member_by_group"),
                    q.Ref(q.Collection("Groups"), req.params.id )
                    )),
                    q.Lambda("member",
                        q.Get(q.Var("member"))
                    )
                )
    ).catch(err => res.json(err))

    const roles = await userClient(req.body.token).query(
        q.Map(
            q.Paginate(
                q.Match(
                    q.Index("member+role_by_group"), 
                    q.Ref(q.Collection("Groups"), req.params.id )
                    )),
                    q.Lambda("role",
                        q.Var("role")
                )
            )
    ).catch(err => res.json(err))

    const membersAndRoles = () => {
        const mergedArr = []
        for (let i = 0; i < roles.data.length; i++) {
        const role = roles.data[i];
        const roleID = role[0].toString().split('"')[3]
        console.log('ROLEID:  ', roleID)
        console.log('ROLE: ',role)
            for (let j = 0; j < roles.data.length; j++) {
                const member = members.data[j]
                console.log('MEMBER: ', member)
                if(member.ref.toString().includes(roleID)){
                    const namedUser = {
                        ref: member.ref,
                        data: member.data,
                        role: role[1]
                    }
                    console.log('NAMED: ', namedUser)
                    mergedArr.push(namedUser)
                }
            }
        }
        return mergedArr
    }

    const membersNroles = await membersAndRoles()

    console.log('GROUP: ', group)
    console.log('MEMBERS: ', members)
    console.log('ROLES: ', roles.data)
    console.log('MEMBERS+ROLES: ', membersNroles)

    res.json( {group: group, members: membersNroles} )
})

// GET ALL GROUPS FOR SEARCH
app.post("/allgroups", async (req,res) => {

    const response = await userClient(req.body.token).query(
        q.Map(
            q.Paginate(q.Match(q.Index('all_groups_paginate'))),
            q.Lambda("group", q.Get(q.Var("group")))
        )
    ).catch(err => res.json(err))
    res.json( response.data )
})

// UPDATE A GROUP PROFILE
app.put("/group/:id", async (req,res) => {

    const response = await userClient(req.body.userAuth.token).query(
        q.Update(
            q.Ref(q.Collection('Groups'), req.body.id),
            { data: req.body.data }
        )
    ).catch(err => res.json(err))
    res.json(response.data)
})

// JOIN A GROUP
app.post("/joingroup", async (req,res) => {
    const response = await userClient(req.body.userAuth.token).query(
        q.Create(
            q.Collection("Relationships"), {
                data: {
                    member: q.Ref(q.Collection("Users"), req.body.userAuth.userRef),
                    group: q.Ref(q.Collection("Groups"), req.body.id),
                    role: req.body.role
                }
            }
        )
    ).catch(err => res.json(err))
    res.json(response.data)
})

// GET A LOGGED IN USERS GROUPS
app.post("/home", async (req,res) => {
    const groups = await userClient(req.body.token).query(
        q.Map(
            q.Paginate(
                q.Match(
                    q.Index("group_by_member"),
                    q.Ref(q.Collection("Users"), req.body.userRef )
                    )),
                    q.Lambda("group",
                        q.Get(q.Var("group"))
                    )
                )
        
    ).catch(err => res.json(err))
    res.json( groups.data )
})