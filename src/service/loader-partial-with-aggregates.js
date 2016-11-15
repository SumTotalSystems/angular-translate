angular.module('pascalprecht.translate')
/**
 * @ngdoc object
 * @name pascalprecht.translate.$translatePartialLoaderProvider
 *
 * @description
 * By using a $translatePartialLoaderProvider you can configure a list of a needed
 * translation parts directly during the configuration phase of your application's
 * lifetime. All parts you add by using this provider would be loaded by
 * angular-translate at the startup as soon as possible.
 */
.provider('$translatePartialLoader', $translatePartialLoader);

function $translationPartialLoader() {
  'use strict';

  function createLocalStorageKey(partName, lang) {
    return 'translations_' + partName + '_' + lang;
  }

  function Aggregate(names, priority) {
    this.names = names;
    this.isActive = true;
    this.partTables = {};
    this.tables = {};
    this.priority = priority || 0;
  }

  Aggregate.prototype.parseUrl = function (urlTemplate, parts, targetLang) {
    if (angular.isFunction(urlTemplate)) {
      return urlTemplate(parts, targetLang);
    }
    return urlTemplate.replace(/\{parts\}/g, parts.join(',')).replace(/\{lang\}/g, targetLang);
  };

  Aggregate.prototype.getFromCache = function ($log, part, lang, partHash) {
    if (this.tables[part] && this.tables[part][lang] && this.tables[part][lang].hash == partHash) {
      return this.tables[part][lang];
    } else {
      var self = this,
        storageKey = createLocalStorageKey(part, lang),
        storageData = null;

      // STOP! (collaborate and listen...)
      // Check local storage for translation information for this part
      if (localStorage[storageKey]) {
        storageData = JSON.parse(localStorage[storageKey]);
      }

      // If there is translation information for this part check that its hash is still valid
      if (storageData && storageData.hash != partHash) {
        $log.debug('Hash mismatch. Throwing out the local data for ' + part + '.')
        storageData = null;
      }

      return storageData;
    }
  };

  Aggregate.prototype.getTable = function ($log, lang, $q, $http, $httpOptions, urlTemplate, hashes, errorHandler) {
    var self = this,
      table = {},
      partsToRequest = [];

    // Go through each of the parts that are going to be requested in aggregate and see if they have already been requested
    angular.forEach(this.names, function (name) {
      // See if this part is cached
      var cachedPart = self.getFromCache($log, name, lang, hashes[name]);

      // If the part is cached then extend the results table with its translations
      if (cachedPart) {
        // Extend the result table by using the cached results table (where the actual translations are stored)
        deepExtend(table, cachedPart.table);
      } else {
        // The part wasn't cached so set it up to be requested.
        partsToRequest.push(name);
      }
    });

    // If there are one or more parts to request do so.
    // Basically, even though this is an aggregate part we may have a part within the aggregate that needs to be refreshed.
    if (partsToRequest.length > 0) {
      $log.debug('Asking the server for the translation information for ' + partsToRequest.join(', ') + '.');

      return $http(angular.extend({
        method: 'GET',
        url: this.parseUrl(urlTemplate, partsToRequest, lang)
      }, $httpOptions))
      .then(function (result) {
        // The result's data will have our "special" response.
        // This response will be an array of all the results for all requested parts.
        if (result.data && result.data) {
          // Go throught the parts, cache them, and then extend out the results table
          angular.forEach(result.data, function (partResult) {
            // Is there an in-memory cache for this part?
            if (!self.partTables[partResult.moduleName]) {
              // Create a placeholder
              self.partTables[partResult.moduleName] = {};
            }
            // Add the part to the in-memory cache
            self.partTables[partResult.moduleName] = partResult;

            // Add the part to local storage.
            localStorage[createLocalStorageKey(partResult.moduleName, lang)] = JSON.stringify(partResult);

            // Extend the results table with the part's translations.
            deepExtend(table, partResult.table);
          });
        }

        if (!self.tables) {
          self.tables = {};
        }

        // Set the internal storage for the table. This is directly accessed by the assembling function in the service.
        // I think that having the translation stored on the part is correct, but I don't like that another function
        // relies on it being there when a promise for the table is returned from within the function.
        self.tables[lang] = table;

        // Hand off the translation table
        return table;
      }, function () {
        if (errorHandler) {
          return errorHandler(self.name, lang)
            .then(function (data) {
              self.tables[lang] = data;
              return data;
            }, function () {
              return $q.reject(self.name);
            });
        } else {
          return $q.reject(self.name);
        }
      });
    } else {
      // Executed when every part within the aggregate is cached.
      if (!this.tables) {
        this.tables = {};
      }

      this.tables[lang] = table;

      // return the aggregate table of the parts.
      return $q.when(table);
    }
  };

  /**
   * Gets the the hash info for this part.
   * @param Object allHashes An object hash of all parts keyed on the part's name.
   * @returns Array The hashes for the aggregate part.
   */
  Aggregate.prototype.getHashInfo = function (hashes) {
    // Since this aggregate part has multiple part keys we'll hand back an array of their hashes.

    var aggregateHashes = {};

    angular.forEach(this.names, function (name) {
      if (hashes && hashes[name]) {
        aggregateHashes[name] = hashes[name];
      }
    });

    return aggregateHashes;
  };

  /**
 * @constructor
 * @name Part
 *
 * @description
 * Represents Part object to add and set parts at runtime.
 */
  function Part(name, priority) {
    this.name = name;
    this.isActive = true;
    this.tables = {};
    this.priority = priority || 0;
  }

  /**
   * @name parseUrl
   * @method
   *
   * @description
   * Returns a parsed url template string and replaces given target lang
   * and part name it.
   *
   * @param {string|function} urlTemplate - Either a string containing an url pattern (with
   *                                        '{part}' and '{lang}') or a function(part, lang)
   *                                        returning a string.
   * @param {string} targetLang - Language key for language to be used.
   * @return {string} Parsed url template string
   */
  Part.prototype.parseUrl = function (urlTemplate, targetLang) {
    if (angular.isFunction(urlTemplate)) {
      return urlTemplate(this.name, targetLang);
    }
    return urlTemplate.replace(/\{part\}/g, this.name).replace(/\{lang\}/g, targetLang);
  };

  /**
   *
   * @param {type} lang
   * @param {type} $q
   * @param {type} $http
   * @param {type} $httpOptions
   * @param {type} urlTemplate
   * @param {type} dataHash
   * @param {type} errorHandler
   */
  Part.prototype.getTable = function ($log, lang, $q, $http, $httpOptions, urlTemplate, dataHash, errorHandler) {
    if (!this.tables[lang]) {
      var self = this,
        storageKey = createLocalStorageKey(this.name, lang),
        storageData = null;

      // STOP! (collaborate and listen...)
      // Check local storage for translation information for this part
      if (localStorage[storageKey]) {
        storageData = JSON.parse(localStorage[storageKey]);
      }

      // If there is translation information for this part check that its hash is still valid
      if (storageData && storageData.hash != dataHash) {
        $log.debug('Hash mismatch. Throwing out the local data for ' + this.name + '.');
        storageData = null;
      }

      // If we have storage data then create a promise to hand back the result.
      if (storageData) {
        $log.debug('Got the translation data from local storage for ' + this.name);

        self.tables[lang] = storageData.table;

        return $q.when(self.tables[lang]);
      } else {
        // No storage data so get the data from the server.
        $log.debug('Asking the server for the translation information for ' + this.name + '.');
        return $http(angular.extend({
          method: 'GET',
          url: this.parseUrl(urlTemplate, lang)
        }, $httpOptions))
        .then(function (result) {
          // the result's data will have our "special" response.

          // If the result's data has the table object set it into the tables hash.
          if (result.data && result.data.table) {
            self.tables[lang] = result.data.table;
          }

          // Now that there is data back from the server we're going to take the data and place it into local storage
          localStorage[storageKey] = JSON.stringify(result.data);

          // Hand off the translation table
          return result.data.table;
        }, function () {
          if (errorHandler) {
            return errorHandler(self.name, lang)
              .then(function (data) {
                self.tables[lang] = data;
                return data;
              }, function () {
                return $q.reject(self.name);
              });
          } else {
            return $q.reject(self.name);
          }
        });
      }
    } else {
      return $q.when(this.tables[lang]);
    }
  };

  /**
   * Gets the the hash info for this part.
   * @param Object allHashes An object hash of all parts keyed on the part's name.
   * @returns String The hash for the part.
   */
  Part.prototype.getHashInfo = function (allHashes) {
    return allHashes[this.name];
  };

  var parts = {};
  var aggregatedParts = null;

  function hasPart(name) {
    return Object.prototype.hasOwnProperty.call(parts, name);
  }

  function hasAggregate(names) {
    return Object.prototype.hasOwnProperty.call(aggregatedParts, names.join(''));
  }

  function isStringValid(str) {
    return angular.isString(str) && str !== '';
  }

  function isPartAvailable(name) {
    if (!isStringValid(name)) {
      throw new TypeError('Invalid type of a first argument, a non-empty string expected.');
    }

    return (hasPart(name) && parts[name].isActive);
  }

  function deepExtend(dst, src) {
    for (var property in src) {
      if (src[property] && src[property].constructor &&
        src[property].constructor === Object) {
        dst[property] = dst[property] || {};
        deepExtend(dst[property], src[property]);
      } else {
        dst[property] = src[property];
      }
    }
    return dst;
  }

  function addAggregateParts(names) {
    if (!angular.isArray(names)) {
      throw new TypeError('Couldn\'t add aggregate parts, first arg has to be an array of strings.');
    }

    if (!aggregatedParts) {
      aggregatedParts = {};
    }

    var key = names.join('');

    if (!hasAggregate(names)) {
      aggregatedParts[key] = new Aggregate(names);
    } else if (!aggregatedParts[key].isActive) {
      aggregatedParts[key].isActive = true;
    }
  }

  /**
   * Get the parts based on priority ordering.
   * @param Object options Current options. Used for url templates.
   * @returns Array All parts sorted by priority.
   */
  function getPrioritizedParts(options) {
    var prioritizedParts = [];

    // Get all the parts which ard defined as a single part.
    for (var part in parts) {
      if (parts[part].isActive) {
        parts[part].urlTemplate = options.urlTemplate;
        prioritizedParts.push(parts[part]);
      }
    }

    // Get all the parts which are collections of keys
    for (var part in aggregatedParts) {
      if (aggregatedParts[part].isActive) {
        aggregatedParts[part].urlTemplate = options.aggregateUrlTemplate;
        prioritizedParts.push(aggregatedParts[part]);
      }
    }

    // Sort the parts based on priority
    prioritizedParts.sort(function (a, b) {
      return a.priority - b.priority;
    });

    // Return the collection.
    return prioritizedParts;
  }


  /**
   * @ngdoc function
   * @name pascalprecht.translate.$translatePartialLoaderProvider#addPart
   * @methodOf pascalprecht.translate.$translatePartialLoaderProvider
   *
   * @description
   * Registers a new part of the translation table to be loaded once the
   * `angular-translate` gets into runtime phase. It does not actually load any
   * translation data, but only registers a part to be loaded in the future.
   *
   * @param {string} name A name of the part to add
   * @param {int} [priority=0] Sets the load priority of this part.
   *
   * @returns {object} $translatePartialLoaderProvider, so this method is chainable
   * @throws {TypeError} The method could throw a **TypeError** if you pass the param
   * of the wrong type. Please, note that the `name` param has to be a
   * non-empty **string**.
   */
  this.addPart = function (name, priority) {
    if (!isStringValid(name)) {
      throw new TypeError('Couldn\'t add part, part name has to be a string!');
    }

    if (!hasPart(name)) {
      parts[name] = new Part(name, priority);
    }
    parts[name].isActive = true;

    return this;
  };

  this.addAggregateParts = function (names) {
    addAggregateParts(names);

    return this;
  };

  /**
   * @ngdocs function
   * @name pascalprecht.translate.$translatePartialLoaderProvider#setPart
   * @methodOf pascalprecht.translate.$translatePartialLoaderProvider
   *
   * @description
   * Sets a translation table to the specified part. This method does not make the
   * specified part available, but only avoids loading this part from the server.
   *
   * @param {string} lang A language of the given translation table
   * @param {string} part A name of the target part
   * @param {object} table A translation table to set to the specified part
   *
   * @return {object} $translatePartialLoaderProvider, so this method is chainable
   * @throws {TypeError} The method could throw a **TypeError** if you pass params
   * of the wrong type. Please, note that the `lang` and `part` params have to be a
   * non-empty **string**s and the `table` param has to be an object.
   */
  this.setPart = function (lang, part, table) {
    if (!isStringValid(lang)) {
      throw new TypeError('Couldn\'t set part.`lang` parameter has to be a string!');
    }
    if (!isStringValid(part)) {
      throw new TypeError('Couldn\'t set part.`part` parameter has to be a string!');
    }
    if (typeof table !== 'object' || table === null) {
      throw new TypeError('Couldn\'t set part. `table` parameter has to be an object!');
    }

    if (!hasPart(part)) {
      parts[part] = new Part(part);
      parts[part].isActive = false;
    }

    parts[part].tables[lang] = table;
    return this;
  };

  /**
   * @ngdoc function
   * @name pascalprecht.translate.$translatePartialLoaderProvider#deletePart
   * @methodOf pascalprecht.translate.$translatePartialLoaderProvider
   *
   * @description
   * Removes the previously added part of the translation data. So, `angular-translate` will not
   * load it at the startup.
   *
   * @param {string} name A name of the part to delete
   *
   * @returns {object} $translatePartialLoaderProvider, so this method is chainable
   *
   * @throws {TypeError} The method could throw a **TypeError** if you pass the param of the wrong
   * type. Please, note that the `name` param has to be a non-empty **string**.
   */
  this.deletePart = function (name) {
    if (!isStringValid(name)) {
      throw new TypeError('Couldn\'t delete part, first arg has to be string.');
    }

    if (hasPart(name)) {
      parts[name].isActive = false;
    }

    return this;
  };


  /**
   * @ngdoc function
   * @name pascalprecht.translate.$translatePartialLoaderProvider#isPartAvailable
   * @methodOf pascalprecht.translate.$translatePartialLoaderProvider
   *
   * @description
   * Checks if the specific part is available. A part becomes available after it was added by the
   * `addPart` method. Available parts would be loaded from the server once the `angular-translate`
   * asks the loader to that.
   *
   * @param {string} name A name of the part to check
   *
   * @returns {boolean} Returns **true** if the part is available now and **false** if not.
   *
   * @throws {TypeError} The method could throw a **TypeError** if you pass the param of the wrong
   * type. Please, note that the `name` param has to be a non-empty **string**.
   */
  this.isPartAvailable = isPartAvailable;

  /**
   * @ngdoc object
   * @name pascalprecht.translate.$translatePartialLoader
   *
   * @requires $q
   * @requires $http
   * @requires $injector
   * @requires $rootScope
   * @requires $translate
   *
   * @description
   *
   * @param {object} options Options object
   *
   * @throws {TypeError}
   */
  this.$get = ['$rootScope', '$injector', '$q', '$http', '$log',
  function ($rootScope, $injector, $q, $http, $log) {

    /**
     * @ngdoc event
     * @name pascalprecht.translate.$translatePartialLoader#$translatePartialLoaderStructureChanged
     * @eventOf pascalprecht.translate.$translatePartialLoader
     * @eventType broadcast on root scope
     *
     * @description
     * A $translatePartialLoaderStructureChanged event is called when a state of the loader was
     * changed somehow. It could mean either some part is added or some part is deleted. Anyway when
     * you get this event the translation table is not longer current and has to be updated.
     *
     * @param {string} name A name of the part which is a reason why the event was fired
     */

    var service = function (options) {
      if (!isStringValid(options.key)) {
        throw new TypeError('Unable to load data, a key is not a non-empty string.');
      }

      if (!isStringValid(options.urlTemplate) && !angular.isFunction(options.urlTemplate)) {
        throw new TypeError('Unable to load data, a urlTemplate is not a non-empty string or not a function.');
      }

      var errorHandler = options.loadFailureHandler;
      if (errorHandler !== undefined) {
        if (!angular.isString(errorHandler)) {
          throw new Error('Unable to load data, a loadFailureHandler is not a string.');
        } else {
          errorHandler = $injector.get(errorHandler);
        }
      }

      /*
        * When the service loads get all the tables for each part based on each part's priority. The
        * collection of prioritized parts can contain a Part or Aggregate object. The call to the
        * 'getPrioritizedParts' method sends the current options so that the correct url template
        * may be applied to each type of part. Each part type also has a definition for
        * 'getHashInfo'. This allows the following forEach loop to execute on either type and send
        * the correct url template and hash info to the type's 'getTable' method.
        */
      var loaders = [],
          prioritizedParts = getPrioritizedParts(options);

      angular.forEach(prioritizedParts, function (part) {
        // send the part (options.key), the Promise provider, http provider, http options (from the original setup),
        // url template (from the original setup), storage hash (hash list was stored and passed in during setup), and error handler.
        loaders.push(part.getTable($log, options.key, $q, $http, options.$http, part.urlTemplate, part.getHashInfo(options.partsHashes), errorHandler));
      });

      // Return a promise for a translation table hash where the key is the translation key and its value is the translated value.
      return $q.all(loaders)
        .then(function (results) {
          // not quite sure on why the original code didn't use the results passed in from the aggregate promise resolving...
          // Will investigate further to see if the result of the promise can be used instead of re-querying the parts list.

          // Create a table to store the results and get all the parts.
          var table = {};
          prioritizedParts = getPrioritizedParts(options);

          // Loop through the parts and get the table for the key (language)
          angular.forEach(prioritizedParts, function (part) {
            deepExtend(table, part.tables[options.key]);
          });

          // Return the aggregate hash of keys to translations.
          return table;
        }, function () {
          return $q.reject(options.key);
        });
    };

    /**
     * @ngdoc function
     * @name pascalprecht.translate.$translatePartialLoader#addPart
     * @methodOf pascalprecht.translate.$translatePartialLoader
     *
     * @description
     * Registers a new part of the translation table. This method does not actually perform any xhr
     * requests to get translation data. The new parts will be loaded in order of priority from the server next time
     * `angular-translate` asks the loader to load translations.
     *
     * @param {string} name A name of the part to add
     * @param {int} [priority=0] Sets the load priority of this part.
     *
     * @returns {object} $translatePartialLoader, so this method is chainable
     *
     * @fires {$translatePartialLoaderStructureChanged} The $translatePartialLoaderStructureChanged
     * event would be fired by this method in case the new part affected somehow on the loaders
     * state. This way it means that there are a new translation data available to be loaded from
     * the server.
     *
     * @throws {TypeError} The method could throw a **TypeError** if you pass the param of the wrong
     * type. Please, note that the `name` param has to be a non-empty **string**.
     */
    service.addPart = function (name, priority, initiator) {
      if (!isStringValid(name)) {
        throw new TypeError('Couldn\'t add part, first arg has to be a string');
      }

      var opts = {
        names: null,
        name: name,
        initiator: initiator
      };

      if (!hasPart(name)) {
        parts[name] = new Part(name, priority);
        $rootScope.$emit('$translatePartialLoaderStructureChanged', opts);
      } else if (!parts[name].isActive) {
        parts[name].isActive = true;
        $rootScope.$emit('$translatePartialLoaderStructureChanged', opts);
      }

      return service;
    };

    service.addAggregateParts = function (names, initiator) {
      addAggregateParts(names);

      var opts = {
        names: names,
        name: null,
        initiator: initiator
      };

      // After the aggregatd part has been added fire the event that says the structure has changed.
      $rootScope.$emit('$translatePartialLoaderStructureChanged', opts);

      return service;
    };

    /**
     * @ngdoc function
     * @name pascalprecht.translate.$translatePartialLoader#deletePart
     * @methodOf pascalprecht.translate.$translatePartialLoader
     *
     * @description
     * Deletes the previously added part of the translation data. The target part could be deleted
     * either logically or physically. When the data is deleted logically it is not actually deleted
     * from the browser, but the loader marks it as not active and prevents it from affecting on the
     * translations. If the deleted in such way part is added again, the loader will use the
     * previously loaded data rather than loading it from the server once more time. But if the data
     * is deleted physically, the loader will completely remove all information about it. So in case
     * of recycling this part will be loaded from the server again.
     *
     * @param {string} name A name of the part to delete
     * @param {boolean=} [removeData=false] An indicator if the loader has to remove a loaded
     * translation data physically. If the `removeData` if set to **false** the loaded data will not be
     * deleted physically and might be reused in the future to prevent an additional xhr requests.
     *
     * @returns {object} $translatePartialLoader, so this method is chainable
     *
     * @fires {$translatePartialLoaderStructureChanged} The $translatePartialLoaderStructureChanged
     * event would be fired by this method in case a part deletion process affects somehow on the
     * loaders state. This way it means that some part of the translation data is now deprecated and
     * the translation table has to be recompiled with the remaining translation parts.
     *
     * @throws {TypeError} The method could throw a **TypeError** if you pass some param of the
     * wrong type. Please, note that the `name` param has to be a non-empty **string** and
     * the `removeData` param has to be either **undefined** or **boolean**.
     */
    service.deletePart = function (name, removeData) {
      if (!isStringValid(name)) {
        throw new TypeError('Couldn\'t delete part, first arg has to be string');
      }

      if (removeData === undefined) {
        removeData = false;
      } else if (typeof removeData !== 'boolean') {
        throw new TypeError('Invalid type of a second argument, a boolean expected.');
      }

      if (hasPart(name)) {
        var wasActive = parts[name].isActive;
        if (removeData) {
          var $translate = $injector.get('$translate');
          var cache = $translate.loaderCache();
          if (typeof (cache) === 'string') {
            // getting on-demand instance of loader
            cache = $injector.get(cache);
          }
          // Purging items from cache...
          if (typeof (cache) === 'object') {
            angular.forEach(parts[name].tables, function (value, key) {
              cache.remove(parts[name].parseUrl(parts[name].urlTemplate, key));
            });
          }
          delete parts[name];
        } else {
          parts[name].isActive = false;
        }
        if (wasActive) {
          $rootScope.$emit('$translatePartialLoaderStructureChanged', name);
        }
      }

      return service;
    };

    /**
     * @ngdoc function
     * @name pascalprecht.translate.$translatePartialLoader#isPartLoaded
     * @methodOf pascalprecht.translate.$translatePartialLoader
     *
     * @description
     * Checks if the registered translation part is loaded into the translation table.
     *
     * @param {string} name A name of the part
     * @param {string} lang A key of the language
     *
     * @returns {boolean} Returns **true** if the translation of the part is loaded to the translation table and **false** if not.
     *
     * @throws {TypeError} The method could throw a **TypeError** if you pass the param of the wrong
     * type. Please, note that the `name` and `lang` params have to be non-empty **string**.
     */
    service.isPartLoaded = function (name, lang) {
      return angular.isDefined(parts[name]) && angular.isDefined(parts[name].tables[lang]);
    };

    /**
     * @ngdoc function
     * @name pascalprecht.translate.$translatePartialLoader#getRegisteredParts
     * @methodOf pascalprecht.translate.$translatePartialLoader
     *
     * @description
     * Gets names of the parts that were added with the `addPart`.
     *
     * @returns {array} Returns array of registered parts, if none were registered then an empty array is returned.
     */
    service.getRegisteredParts = function () {
      var registeredParts = [];
      angular.forEach(parts, function (p) {
        if (p.isActive) {
          registeredParts.push(p.name);
        }
      });
      return registeredParts;
    };



    /**
     * @ngdoc function
     * @name pascalprecht.translate.$translatePartialLoader#isPartAvailable
     * @methodOf pascalprecht.translate.$translatePartialLoader
     *
     * @description
     * Checks if a target translation part is available. The part becomes available just after it was
     * added by the `addPart` method. Part's availability does not mean that it was loaded from the
     * server, but only that it was added to the loader. The available part might be loaded next
     * time the loader is called.
     *
     * @param {string} name A name of the part to delete
     *
     * @returns {boolean} Returns **true** if the part is available now and **false** if not.
     *
     * @throws {TypeError} The method could throw a **TypeError** if you pass the param of the wrong
     * type. Please, note that the `name` param has to be a non-empty **string**.
     */
    service.isPartAvailable = isPartAvailable;

    return service;

  }];

}

$translationPartialLoader.displayName = '$translatePartialLoader';