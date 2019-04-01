/* Copyright (c) 2013 Gordon Williams, Pur3 Ltd. See the file LICENSE for copying permission. */
//see: https://www.espruino.com/modules/RFM69.js
//see: https://www.espruino.com/modules/RFK69.js

var RFK69HFreqTbl = {
315 : new Uint16Array([0x074e, 0x08c0, 0x0900]), //315MHz
434 : new Uint16Array([0x076c, 0x0880, 0x0900]), //434MHz
868 : new Uint16Array([0x07d9, 0x0800, 0x0900]), //868MHz
915 : new Uint16Array([0x07e4, 0x08c0, 0x0900])  //915MHz
};

var RFK69HRateTbl = [
[0x0368, 0x042B],         //BR=1.2K BW=83.333K
//[0x0334, 0x0415],         //BR=2.4K BW=83.333K
//[0x031A, 0x040B],         //BR=4.8K BW=83.333K
//[0x030D, 0x0405]          //BR=9.6K BW=83.333K
];
/*
var RFK69HPowerTbl = new Uint16Array([
0x117F,                   //20dbm
//   0x117C,                   //17dbm
//   0x1179,                   //14dbm
//   0x1176                    //11dbm
]);
*/
var RFK69HConfigTbl = new Uint16Array([
0x0200,                   //RegDataModul, FSK Packet
0x0502,                   //RegFdevMsb, 241*61Hz = 35KHz
0x0641,                   //RegFdevLsb
0x1952,                   //RegRxBw , RxBW, 83KHz

0x2C00,                   //RegPreambleMsb
0x2D05,                   //RegPreambleLsb, 5Byte Preamble
0x2E90,                   //enable Sync.Word, 2+1=3bytes
0x2FAA,                   //0xAA, SyncWord = aa2dd4
0x302D,                   //0x2D
0x31D4,                   //0xD4
//  0x3700,                 //RegPacketConfig1, Fixed length, Disable CRC, No DC-free encode, No address filter
//  0x3815,                 //RegPayloadLength, 21 bytes for length & Fixed length
0x3790,                   //RegPacketConfig1, Variable length, Enable CRC, No address filter
0x3842,                   //RegPayloadLength, 66 bytes MAX for variable length
0x3C95,                   //RegFiFoThresh

0x1888,                   //RegLNA, 200R
//0x581B,                   //RegTestLna, Normal sensitivity
0x582D,                 //RegTestLna, increase sensitivity with LNA (Note: consumption also increase!)
//0x6F30,                   //RegTestDAGC, Improved DAGC
0x6F00,                 //RegTestDAGC, Normal DAGC
0x0104                    //Enter standby mode
]);


var RFK69HRxTbl = new Uint16Array([
0x119F,                   //
0x2544,                   //DIO Mapping for Rx. DIO 0..5 = PayloadReady,FifoLevel,Data,FifoFull
0x1310,                   //OCP enabled
0x5A55,                   //Normal and Rx
0x5C70,                   //Normal and Rx
0x0110                    //Enter Rx mode
]);

var RFK69HTxTbl = new Uint16Array([
0x2504,                   //DIO Mapping for Tx. DIO 0..5 = PacketSent,FifoLevel,Data,FifoFull
0x130F,                   //Disable OCP
0x5A5D,                   //High power mode
0x5C7C,                   //High power mode
0x010C                    //Enter Tx mode
]);


function RFK69(spi, options) {
this.spi = spi;
this.cs = options.cs;
this.rst = options.rst;
this.freq = (options.freq in RFK69HFreqTbl) ? options.freq : 915;
}

/// Initialise the RFK69 - called automatically by require("RFK69").connect
RFK69.prototype.connect = function(callback) {
if (this.rst)
digitalPulse(this.rst,1,100);
var rfm = this;
console.log("Starting Challenge Corridor");
setTimeout(function() {
rfm.w(0x1F,0xAA);
console.log("Register One Set");
if (rfm.r(0x1F)!=0xAA) throw new Error("RFK69 not found in 0x1F")
  console.log("Register One Cleared");
rfm.w(0x28,0x55);
console.log("Register Two Set");
if (rfm.r(0x28)!=0x55) throw new Error("RFK69 not found in 0x2F");
  console.log("Register Two Cleared");
console.log("Challenge Corridor Complete");
// setup freq
RFK69HFreqTbl[915].forEach(rfm.w16.bind(rfm));
// setup rate
RFK69HRateTbl[0].forEach(rfm.w16.bind(rfm));
// general init
RFK69HConfigTbl.forEach(rfm.w16.bind(rfm));
if (callback) callback();
}, 100);
};

/// Internal: read register
RFK69.prototype.r = function(a) {
  console.log(this.spi.send([a&0x7f,0], this.cs));
  return this.spi.send([a&0x7f,0], this.cs)[1];
};
/// Internal: write register
RFK69.prototype.w = function(a,v) {
  this.spi.send([a|128,v], this.cs);
};
/// Internal: write register and value in one
RFK69.prototype.w16 = function w16(v) {
this.spi.send([(v>>8)|128,v], this.cs);
};

/** Put the RFK69 into receive mode. After this,
DIO0 should be raised if a packet is ready, however
you can poll with `hasPacket` */
RFK69.prototype.rxmode = function() {
RFK69HRxTbl.forEach(this.w16.bind(this));
};

/// Return true if RFK69 has received a packet, false otherwise
RFK69.prototype.hasPacket = function() {
return !!(this.r(0x28)&4);
};

/// Get a packet received by RFK69, as a Uint8Array
RFK69.prototype.getPacket = function() {
if (!(this.r(0x28)&4)) return undefined; // no packet
this.w16(0x0104); // standby
this.cs.reset(); // chip select
var len = this.spi.send([0,0])[1];
var d = this.spi.send(new Uint8Array(len));
this.cs.set(); // let go of CS
this.w16(0x0110); // enter RX mode again
return d;
};

/// Send a packet, maximum length is 64 bytes
RFK69.prototype.sendPacket = function (d, callback) {
this.w16(0x0104); // standby
var rfm = this;
setTimeout(function() { // wait for us to hit standby
rfm.spi.write(0x80, d.length, d, rfm.cs);
RFK69HTxTbl.forEach(rfm.w16.bind(rfm)); // enter TX mode

var t = 100; // 1 sec timeout
var i = setInterval(function() {
if (rfm.r(0x28)&8 || t-- < 0) {
rfm.w16(0x0104); // standby
clearInterval(i);
if (t<0) throw "Timeout in RF69 send";
if (callback) callback();
}
}, 10);
}, 1);
};

/** Create an RFK69 object using the given SPI bus.

`options` can contain:
cs : chip select pin (required)
rst : reset pin (optional)
freq : frequency - one of 315, 434, 868, 915 (default is 434)

`callback` is optional and is called when the RFK69 has been initialised
*/
exports.connect = function(spi,options,callback) {
  console.log('calling connect');
var rfm = new RFK69(spi,options);
rfm.connect(callback);
return rfm;
}

