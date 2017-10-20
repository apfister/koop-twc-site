const provider = {
  type: 'provider',
  name: 'twc-site',
  hosts: false,
  Model: require('./model'),
  version: require('./package.json').version
};

module.exports = provider;
