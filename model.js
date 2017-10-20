const rp = require('request-promise-native');
const config = require('config');
const moment = require('moment');

function Model (koop) {}

Model.prototype.getData = function (req, callback) {
  const splits = req.params.id.split(':');
  const itemId = splits[0];
  const layerIndex = splits[1];

  getItemData(itemId, layerIndex)
    .then(getLayerInfo)
    .then(getFeatures)
    .then(response => {
      const apiKey = process.env.TWC_API_KEY || config.get('twc.apiKey');

      if (!apiKey) {
        return callback(new Error('error getting apiKey'));
      }

      const apiUrl1 = 'https://api.weather.com/v1/geocode/';
      const apiUrl2 = `observations.json?language=en-US&units=e&apiKey=${apiKey}`;

      const promises = response.features.map(feature => {
        const uri = `${apiUrl1}${feature.geometry.y}/${feature.geometry.x}/${apiUrl2}`;

        const params = {
          uri,
          method: 'GET',
          json: true,
          simple: false // reject only due to technical reasons
        };

        return rp(params)
          .then(response => {
            if (response.metadata.status_code === 200) {
              response.metadata.original_attributes = feature.attributes;

              return response;
            } else {
              return null;
            }
          })
          .catch(error => {
            throw new Error(error);
          });
      });

      // START HERE
      Promise.all(promises)
        .then(response => {
          const locations = translate(response);
          locations.ttl = 300; // 5 mins
          locations.metadata = {
            name: 'Observations',
            description: 'Observations provided by The Weather Company',
            displayField: 'obs_name'
          };

          callback(null, locations);
        })
        .catch(error => {
          throw new Error(error);
        });
    })
    .catch(error => {
      callback(error);
    });
};

const getItemData = (itemId, layerIndex) => {
  const params = {
    uri: `http://www.arcgis.com/sharing/rest/content/items/${itemId}/data?f=json`,
    method: 'GET',
    json: true
  };

  return rp(params)
    .then(response => {
      if (response && response.operationalLayers && response.operationalLayers[layerIndex]) {
        const layer = response.operationalLayers[layerIndex];
        return layer;
      }
    })
    .catch(error => {
      throw new Error(error);
    });
};

const getLayerInfo = (layer) => {
  const params = {
    uri: `${layer.url}`,
    method: 'GET',
    json: true,
    qs: {
      f: 'json'
    }
  };

  return rp(params)
    .then(response => {
      const oidField = response.objectIdField;

      const outFields = response.fields.filter(field => {
        return field.name !== oidField && field.name.toUpperCase() !== 'OBJECTID';
      }).map(field => field.name).join(',');

      const uri = `${layer.url}/query`;

      let where = '1=1';
      if (layer.layerDefinition && layer.layerDefinition.definitionExpression && layer.layerDefinition.definitionExpression !== '') {
        where = layer.layerDefinition.definitionExpression;
      }

      const params = {
        uri,
        outFields,
        where
      };

      return params;
    })
    .catch(error => {
      throw new Error(error);
    });
};

const getFeatures = (queryParams) => {
  const params = {
    qs: {
      where: queryParams.where,
      outFields: queryParams.outFields,
      resultRecordCount: 50, // limit to only 50 records
      outSR: 4326,
      f: 'json'
    },
    method: 'GET',
    json: true,
    uri: queryParams.uri
  };
  return rp(params);
};

function translate (locations) {
  const featureCollection = {
    type: 'FeatureCollection',
    features: []
  };

  featureCollection.features = locations.filter(loc => loc && loc.metadata.status_code === 200).map(formatFeature);

  return featureCollection;
}

function formatFeature (location) {
  const feature = {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [location.metadata.longitude, location.metadata.latitude]
    },
    properties: {
      key: location.observation.key,
      class: location.observation.class,
      expire_time_gmt: location.observation.expire_time_gmt,
      expire_time_formatted: moment.unix(location.observation.expire_time_gmt).format('YYYY-MM-DD HH:mm:ss ZZ'),
      obs_id: location.observation.obs_id,
      obs_name: location.observation.obs_name,
      valid_time_gmt: location.observation.valid_time_gmt,
      valid_time_formatted: moment.unix(location.observation.valid_time_gmt).format('YYYY-MM-DD HH:mm:ss ZZ'),
      day_ind: location.observation.day_ind,
      temp: location.observation.temp,
      wx_icon: location.observation.wx_icon,
      icon_extd: location.observation.icon_extd,
      wx_phrase: location.observation.wx_phrase,
      pressure_tend: location.observation.pressure_tend,
      pressure_desc: location.observation.pressure_desc,
      dewPt: location.observation.dewPt,
      heat_index: location.observation.heat_index,
      rh: location.observation.rh,
      pressure: location.observation.pressure,
      vis: location.observation.vis,
      wc: location.observation.wc,
      wdir: location.observation.wdir,
      wdir_cardinal: location.observation.wdir_cardinal,
      gust: location.observation.gust,
      wspd: location.observation.wspd,
      max_temp: location.observation.max_temp,
      min_temp: location.observation.min_temp,
      precip_total: location.observation.precip_total,
      precip_hrly: location.observation.precip_hrly,
      snow_hrly: location.observation.snow_hrly,
      uv_desc: location.observation.uv_desc,
      feels_like: location.observation.feels_like,
      uv_index: location.observation.uv_index,
      qualifier: location.observation.qualifier,
      qualifier_svrty: location.observation.qualifier_svrty,
      blunt_phrase: location.observation.blunt_phrase,
      terse_phrase: location.observation.terse_phrase,
      clds: location.observation.clds,
      water_temp: location.observation.water_temp,
      primary_wave_period: location.observation.primary_wave_period,
      primary_wave_height: location.observation.primary_wave_height,
      primary_swell_period: location.observation.primary_swell_period,
      primary_swell_height: location.observation.primary_swell_height,
      primary_swell_direction: location.observation.primary_swell_direction,
      secondary_swell_period: location.observation.secondary_swell_period,
      secondary_swell_height: location.observation.secondary_swell_height,
      secondary_swell_direction: location.observation.secondary_swell_direction
    }
  };

  feature.properties = Object.assign({}, feature.properties, location.metadata.original_attributes);

  return feature;
}

module.exports = Model;
