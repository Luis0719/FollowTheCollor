if (process.env.NODE_ENV === 'production') {
    //We are in production - return production keys
    module.exports = require('./prodkeys');
}else{
    //We are in development - return development keys
    module.exports = require('./devkeys');
}