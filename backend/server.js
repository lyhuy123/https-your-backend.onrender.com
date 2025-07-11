const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/tsm_pos_stock';

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  stock: Number
});

const saleSchema = new mongoose.Schema({
  items: [{
    productId: mongoose.Schema.Types.ObjectId,
    quantity: Number,
    price: Number
  }],
  date: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);
const Sale = mongoose.model('Sale', saleSchema);

// Products CRUD
app.get('/products', async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

app.post('/products', async (req, res) => {
  try {
    const { name, price, stock } = req.body;
    const product = new Product({ name, price, stock });
    await product.save();
    res.status(201).json(product);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/products/:id', async (req, res) => {
  try {
    const { name, price, stock } = req.body;
    const product = await Product.findByIdAndUpdate(req.params.id, { name, price, stock }, { new: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Sales - record sale and decrement stock
app.post('/sales', async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invalid sale items' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    for (const item of items) {
      const product = await Product.findById(item._id).session(session);
      if (!product) throw new Error('Product not found');
      if (product.stock < item.quantity) throw new Error('Insufficient stock for ' + product.name);
      product.stock -= item.quantity;
      await product.save({ session });
    }
    const sale = new Sale({ items: items.map(i => ({ productId: i._id, quantity: i.quantity, price: i.price })) });
    await sale.save({ session });
    await session.commitTransaction();
    session.endSession();
    res.json({ message: 'Sale recorded' });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ error: e.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
