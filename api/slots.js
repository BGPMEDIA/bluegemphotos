const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SLOTS_KEY = 'bgp_booked_slots';

async function redisGetSlots(){
  const res = await fetch(`${REDIS_URL}/get/${SLOTS_KEY}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const data = await res.json();
  if(!data.result) return {};
  let result = data.result;
  if(typeof result === 'string'){
    try { result = JSON.parse(result); } catch(e){ return {}; }
  }
  if(typeof result === 'string'){
    try { result = JSON.parse(result); } catch(e){ return {}; }
  }
  return typeof result === 'object' && !Array.isArray(result) ? result : {};
}

async function redisSetSlots(value){
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([['SET', SLOTS_KEY, JSON.stringify(value)]])
  });
  return await res.json();
}

module.exports = async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if(req.method === 'OPTIONS') return res.status(200).end();

  // GET — return all booked slots or slots for a specific date
  if(req.method === 'GET'){
    const slots = await redisGetSlots();
    const { date } = req.query;
    if(date){
      return res.status(200).json({ success: true, booked: slots[date] || [] });
    }
    return res.status(200).json({ success: true, slots });
  }

  // POST — mark a slot as booked
  if(req.method === 'POST'){
    const { date, time, service, name } = req.body;
    if(!date || !time) return res.status(400).json({ success: false, error: 'Date and time required' });
    const slots = await redisGetSlots();
    if(!slots[date]) slots[date] = [];
    // Check if already booked
    const alreadyBooked = slots[date].find(s => s.time === time && s.service === (service || 'Action Shot Session'));
    if(alreadyBooked){
      return res.status(409).json({ success: false, error: 'Slot already booked' });
    }
    slots[date].push({
      time,
      service: service || 'Action Shot Session',
      name: name || 'Unknown',
      bookedAt: new Date().toISOString()
    });
    await redisSetSlots(slots);
    return res.status(200).json({ success: true });
  }

  // DELETE — admin only, free up a slot
  if(req.method === 'DELETE'){
    const { date, time, service } = req.body;
    if(!date || !time) return res.status(400).json({ success: false, error: 'Date and time required' });
    const slots = await redisGetSlots();
    if(slots[date]){
      slots[date] = slots[date].filter(s => !(s.time === time && s.service === (service || 'Action Shot Session')));
      if(slots[date].length === 0) delete slots[date];
    }
    await redisSetSlots(slots);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
};
