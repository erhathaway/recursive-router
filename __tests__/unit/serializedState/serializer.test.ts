import {serializer} from '../../../src/serialized_state';
import {IInputLocation} from '../../../src';

describe('Serializer', () => {
    it('serializes pathname', () => {
        const location = {pathname: ['hi', 'there']};
        const serialized = serializer({pathname: [], search: {}, options: {}, ...location});

        expect(serialized.location).toBe('/hi/there');
    });

    it('serializes search', () => {
        const location = {search: {param1: '1', param2: 'hello'}};
        const serialized = serializer({pathname: [], search: {}, options: {}, ...location});

        expect(serialized.location).toBe('/?param1=1&param2=hello');
    });

    it('serializes both pathname and search', () => {
        const location = {pathname: ['hi', 'there'], search: {param1: '1', param2: 'hello'}};
        const serialized = serializer({pathname: [], search: {}, options: {}, ...location});

        expect(serialized.location).toBe('/hi/there?param1=1&param2=hello');
    });

    it('adds in previous queryParam keys that are not specified in the current location', () => {
        const oldLocation = {pathname: ['hi', 'there'], search: {param1: '1', param2: 'hello'}};
        const newLocation = {pathname: ['good', 'day'], search: {param1: '25'}};

        const serialized = serializer(
            {pathname: [], search: {}, ...newLocation},
            {pathname: [], search: {}, ...oldLocation}
        );
        expect(serialized.location).toEqual('/good/day?param1=25&param2=hello');
    });

    it('removes previous queryParam keys that are set to "undefined"', () => {
        const oldLocation = {pathname: ['hi', 'there'], search: {param1: '1', param2: 'hello'}};
        const newLocation = {
            pathname: ['good', 'day'],
            search: {param1: '25', param2: undefined}
        } as IInputLocation;

        const serialized = serializer(
            {pathname: [], search: {}, ...newLocation},
            {pathname: [], search: {}, ...oldLocation}
        );
        expect(serialized.location).toEqual('/good/day?param1=25');
    });

    it('removes previous queryParam keys that are set to "null"', () => {
        const oldLocation = {pathname: ['hi', 'there'], search: {param1: '1', param2: 'hello'}};
        const newLocation = {
            pathname: ['good', 'day'],
            search: {param1: '25', param2: null}
        } as IInputLocation;

        const serialized = serializer(
            {pathname: [], search: {}, ...newLocation},
            {pathname: [], search: {}, ...oldLocation}
        );
        expect(serialized.location).toEqual('/good/day?param1=25');
    });
});
