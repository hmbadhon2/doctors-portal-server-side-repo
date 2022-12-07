const express = require ('express');
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;


// middleware
app.use(cors())
app.use(express.json())



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.hvwcwlz.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
    console.log('inside verifyJWT',req.headers.authorization)
    const authHeaders = req.headers.authorization;
    if(!authHeaders){
        return res.status(401).send({message:'unauthorized access'})
    }
    const token = authHeaders.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
        if(err){
            res.status(401).send({message:'unauthorized access'})
        }
        req.decoded=decoded
        next();
    })
} 


async function run(){

    try{

         const appointmentOptionsCollection = client.db("doctorsPortal").collection("appointmentOptions");
         const bookingsCollection = client.db("doctorsPortal").collection("bookings");
         const usersCollection = client.db("doctorsPortal").collection("users");
         const doctorsCollection = client.db("doctorsPortal").collection("doctor");


        const verifyAdmin = async(req, res, next) =>{
            const decodedEmail = req.decoded.email;
            const query = { email:decodedEmail}
            const user = await usersCollection.findOne(query);
            if(user?.role !=='admin'){
                res.status(403).send({message:'forbidden access'})
            }
            next()

        } 

        //  use Aggregate to query multiple collection and then merge data
        app.get('/appointmentOptions', async (req, res) =>{  

        const date = req.query.date;
        const query = {};
        const options = await appointmentOptionsCollection.find(query).toArray();
        const bookingQuery = {appointmentDate:date};
        const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

        options.forEach(option =>{
            const optionBooked = alreadyBooked.filter(book =>book.treatment===option.name);
            const slotsBooked = optionBooked.map(book =>book.slot);
            const remainingSlots = option.slots.filter(slot =>!slotsBooked.includes(slot))
            option.slots = remainingSlots;
        })
        res.send(options)
        })

        // app.get('/v2/appointmentOptions', async (req, res) => {
        //     const date = req.query.date;
        //     const options = await appointmentOptionCollection.aggregate([
        //         {
        //             $lookup: {
        //                 from: 'bookings',
        //                 localField: 'name',
        //                 foreignField: 'treatment',
        //                 pipeline: [
        //                     {
        //                         $match: {
        //                             $expr: {
        //                                 $eq: ['$appointmentDate', date]
        //                             }
        //                         }
        //                     }
        //                 ],
        //                 as: 'booked'
        //             }
        //         },
        //         {
        //             $project: {
        //                 name: 1,
        //                 slots: 1,
        //                 booked: {
        //                     $map: {
        //                         input: '$booked',
        //                         as: 'book',
        //                         in: '$$book.slot'
        //                     }
        //                 }
        //             }
        //         },
        //         {
        //             $project: {
        //                 name: 1,
        //                 slots: {
        //                     $setDifference: ['$slots', '$booked']
        //                 }
        //             }
        //         }
        //     ]).toArray();
        //     res.send(options);
        // })

        app.get('/appointmentSpecialty', async (req, res) =>{
            const query = {};
            const result = await appointmentOptionsCollection.find(query).project({name:1}).toArray();
            res.send(result)
        })

         app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email

            if(decodedEmail !== email){
                res.status(403).send({message:'forbidden access'})
            }

            const query = {email:email}
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings)
         })

         app.get('/bookings/:id', async (req, res)=>{
            const id = req.params.id;
            const query = {_id:ObjectId(id)};
            const booking = await bookingsCollection.findOne(query);
            res.send(booking)
         })


         app.post('/bookings', async (req, res) =>{
            const booking = req.body;
            console.log(booking)
            const query = {
                appointmentDate:booking.appointmentDate,
                treatment :booking.treatment,
                email:booking.email
            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();
            if(alreadyBooked.length){
                const message = ` You already have a booking on ${booking.appointmentDate}`;
                return res.send({acknowledge:false, message})
            }
            const result = await bookingsCollection.insertOne(booking);
            res.send(result)
            });

            
            app.post('/create-payment-intent', async (req, res) =>{
                 const booking = req.body;
                 const price = booking.price;
                 const amount = price * 100;
                 const paymentIntent = await stripe.paymentIntents.create({
                    currency:'usd',
                    amount:amount,
                    "payment_method_types": [
                        "card"
                    ]

                 });

                 res.send({
                    clientSecret: paymentIntent.client_secret,
                  });
            })


            // app.post('/create-payment-intent', async (req, res) => {
            //     const booking = req.body;
            //     const price = booking.price;
            //     const amount = price * 100;
            //     const paymentIntent = await stripe.paymentIntents.create({
            //         currency: 'usd',
            //         amount: amount,
            //         "payment_method_types": [
            //             "card"
            //         ]
            //     });
            //     res.send({
            //         clientSecret: paymentIntent.client_secret,
            //     });
            // });
    


           app.get('/jwt', async(req, res)=>{
            const email = req.query.email;
            const query = {email:email};
            const user = await usersCollection.findOne(query);
            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn:'3 days'})

               return res.send({accessToken:token})
            }
            res.status(403).send({accessToken:''})
           })

        //    get all user

        app.get('/users', async (req, res) =>{
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users)
             })

            app.post('/users', async (req, res)=>{
                const user = req.body;
                console.log(user)
                const result = await usersCollection.insertOne(user)
                res.send(result)
                })

            app.get('/users/admin/:email', async(req, res)=>{
                const email = req.params.email;
                const query = {email};
                const  user = await usersCollection.findOne(query);
                res.send({isAdmin: user?.role === 'admin'})
            })


          app.put('/users/:id', verifyJWT,verifyAdmin, async(req, res)=>{
            
            const id = req.params.id;
            const filter = {_id:ObjectId(id)};
            const options= {upsert:true};
            const updatedDoc = {
                $set:{
                    role:'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options)

            res.send(result)
          })

          app.get('/addPrice', async(req, res) =>{
            const filter = {};
            const options = {upsert: true} 
            const updatedDoc= {
                $set:{
                    price:99
                }
            }
            const result = await appointmentOptionsCollection.updateMany(filter, updatedDoc, options);
            res.send(result)
        })

          app.post('/doctors', verifyJWT, async(req, res) =>{
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor)
            res.send(result)
          });

          app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) =>{
            const query = {}
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors)
          })

          app.delete('/doctors/:id', verifyJWT, verifyAdmin, async(req, res)=>{
            const id = req.params.id;
            const filter = {_id: ObjectId(id)};
            const result  = await doctorsCollection.deleteOne(filter);
            res.send(result);
          })
           
            
    }
    finally{

    }

}
run()
.catch(err => console.error(err))


app.get('/', (req, res)=>{
    res.send('my api is running')
})

app.listen(port, () =>{
    console.log(`my api is running on port${port}`)
})