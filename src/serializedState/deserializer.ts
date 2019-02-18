import * as queryString from 'query-string';
import { OutputLocation } from '../types';

const deserializer = (serializedLocation = ''): OutputLocation => {
  const locationStringParts = serializedLocation.split('?');

  const search = queryString.parse(locationStringParts[1], { decode: true, arrayFormat: 'bracket' });
  const pathname = locationStringParts[0].split('/').filter(s => s !== '');

  return { search, pathname, options: {} };
};

export default deserializer;