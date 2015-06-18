angular.module('dashboard.directives.ModelFieldReference', [
  "dashboard.Config",
  "dashboard.services.GeneralModel",
  "ui.select"
])

.directive('modelFieldReferenceView', function($compile) {
  return {
    restrict: 'E',
    template: '<b>{{ options.model }}</b>: {{ data[options.key] }}',
    scope: {
      options: '=options',
      data: '=ngModel',
      required: 'ngRequired',
      disabled: 'ngDisabled'
    },
    link: function(scope, element, attrs) {
    }
  };
})

.directive('modelFieldReferenceEdit', function($compile, $cookies, Config, GeneralModelService) {
  function getTemplate(multiple, matchTemplate, choiceTemplate) {
    var template = '';
    if (multiple) {
      //multi-select
      template = '\
      <ui-select multiple ng-model="selected.items" on-select="onSelect($item, $model)" on-remove="onRemove($item, $model)"> \
      <ui-select-match placeholder="{{ options.placeholder }}">'+ matchTemplate +'</ui-select-match> \
      <ui-select-choices repeat="item in list" refresh="refreshChoices($select.search)" refresh-delay="200">' + choiceTemplate + '</ui-select-choices> \
      </ui-select>';
    } else {
      //single-select
      template = '\
      <ui-select ng-model="selected.item" on-select="onSelect($item, $model)" ng-required="ngRequired" ng-disabled="disabled" > \
      <ui-select-match placeholder="{{ options.placeholder }}">'+ matchTemplate +'</ui-select-match> \
      <ui-select-choices repeat="item in list" refresh="refreshChoices($select.search)" refresh-delay="200">' + choiceTemplate + '</ui-select-choices> \
      </ui-select>';
    }
    return template;
  }
  return {
    restrict: 'E',
    scope: {
      key: '=key',
      property: '=property',
      options: '=options',
      data: '=ngModel',
      modelData: '=modelData',
      disabled: '=ngDisabled',
      rowData: "=ngRowData", //for use in the model list edit mode
      textOutputPath: '=ngTextOutputPath' //output the selected text to this path in the rowData
    },
    link: function(scope, element, attrs) {
        
        scope.selected= {};
        scope.selected.items = []; //for multi-select
        scope.selected.item = {}; //for single select
        scope.list = [];

        function replaceSessionVariables(string) {
          if (typeof string !== 'string') return string;
          try {
            //Look for session variables in string
            var session = JSON.parse($cookies.session); //needed for eval() below
            var searchString = "{session.";
            var startPos = string.indexOf(searchString);
            while (startPos > -1) {
              var endPos = string.indexOf("}", startPos);
              if (endPos == -1) {
                console.error("ModelList session parsing malformed for string");
                break;
              }
              var sessionKey = string.substring(startPos+1, endPos);
              string = string.slice(0, startPos) + eval(sessionKey) + string.slice(endPos+1);
              startPos = string.indexOf(searchString);
            }
            //Look for model data variable strings
            searchString = "{";
            startPos = string.indexOf(searchString);
            while (startPos > -1) {
              var endPos = string.indexOf("}", startPos);
              if (endPos == -1) {
                console.error("ModelList session parsing malformed for string");
                break;
              }
              var key = string.substring(startPos+1, endPos);
              string = string.slice(0, startPos) + scope.modelData[key] + string.slice(endPos+1);
              startPos = string.indexOf(searchString);
            }
          } catch(e) {
            console.error(e);
          }
          return string;
        }

        scope.refreshChoices = function(search) {
//          console.log(search);
//          console.log("scope.data = " + JSON.stringify(scope.data, null, '  '));
//          console.log("scope.field = " + JSON.stringify(scope.field, null, '  '));
          var model = Config.serverParams.models[scope.options.model];
          var params = { 'filter[limit]': 100 }; //limit only 100 items in drop down list
          params['filter[where]['+scope.options.searchField+'][like]'] = search + "%";
          if (scope.options.where) {
            //Add additional filtering on reference results
            var keys = Object.keys(scope.options.where);
            for (var i in keys) {
              var key = keys[i];
              params['filter[where][' + key + ']'] = replaceSessionVariables(scope.options.where[key]);
            }
          }
          if (scope.options.filters) {
            var keys = Object.keys(scope.options.filters);
            for (var i in keys) {
              var key = keys[i];
              params[key] = replaceSessionVariables(scope.options.filters[key]);
            }
          }
          var apiPath = model.plural;
          if (scope.options.api) apiPath = replaceSessionVariables(scope.options.api);
          GeneralModelService.list(apiPath, params).then(function(response) {
            if (!response) return; //in case http request was cancelled by newer request
            scope.list = response;
            if (scope.options.allowInsert) {
              var addNewItem = {};
              addNewItem[scope.options.searchField] = "[Add New Item]";
              scope.list.push(addNewItem);
            }
            if (scope.options.allowClear) {
              var addNewItem = {};
              addNewItem[scope.options.searchField] = "[clear]";
              scope.list.unshift(addNewItem);
              
            }
            if (typeof scope.options.defaultIndex === 'number') {
              if (response[scope.options.defaultIndex]) {
                //scope.selected.items = [response[scope.options.defaultIndex]];
                scope.onSelect(response[scope.options.defaultIndex]);
              }
            }
          });
        };

        var unwatch = scope.$watchCollection('[data, options, modelData]', function(results) {
          if (scope.modelData && scope.modelData && scope.options && scope.options.multiple) {
            if (!scope.property.display.sourceModel) {
              unwatch();
              //No sourceModel so try to populate from modelData for items already selected
              if (scope.modelData[scope.property.display.options.relationship]) {
                scope.selected.items = scope.modelData[scope.property.display.options.relationship];
                scope.list = scope.selected.items; //make sure list contains item otherwise won't be displayed
              }
              return;
            }
            //Lookup multiple records that were previously selected
            var sourceModel = Config.serverParams.models[scope.property.display.sourceModel];
            var referenceModel = Config.serverParams.models[scope.options.model];
            var sourceModelName = sourceModel.plural;
            var referenceModelName = referenceModel.plural;
            var sourceId = scope.modelData[scope.property.display.sourceKey];
            if (!sourceId) {
              return;
            }
            unwatch(); //due to late binding need to unwatch here 
            GeneralModelService.getMany(sourceModelName, sourceId, scope.options.relationship)
            .then(function(response) {
              if (!response) return;  //in case http request was cancelled
              scope.selected.items = response;
              scope.list = response;
            });
            
          } else if (scope.data && scope.options && scope.options.model) {
            unwatch();
            //Lookup default reference record
            var model = Config.serverParams.models[scope.options.model];
            GeneralModelService.get(model.plural, scope.data)
            .then(function(response) {
              if (!response) return;  //in case http request was cancelled
              //console.log("default select = " + JSON.stringify(response));
              scope.selected.item = response;
              scope.list = [scope.selected.item]; //make sure list contains item otherwise won't be displayed
            });
          }
       });
        
       scope.onSelect = function(item, model) {
         if (scope.options.multiple) {
           //For multi-select add as relationship array objects to modelData (when saving, the CMS relational-upsert.js will handle it)
           scope.selected.items.push(item);
           //Make sure to loop through all items for junctionMeta (previously loaded items will not have junctionMeta populated)
           if (scope.options.junctionMeta) {
             for (var i in scope.selected.items) {
               var item = scope.selected.items[i];
               //meta data for junction table in a many-to-many situation
               item.junctionMeta = scope.options.junctionMeta; 
             }
           }
           //Assign to model data
           scope.modelData[scope.options.relationship] = scope.selected.items;
         } else {
           //For single record reference just assign the ID back to data
           scope.data = item[scope.options.key];
           var textValue = item[scope.options.searchField];
            if (item && item[scope.options.searchField] == "[Add New Item]") {
              //console.log("should add " + $select.search);
              console.log("should add item");
              var value = element.find("input.ui-select-search").val();
              console.log(value);
            } else if (item && item[scope.options.searchField] == "[clear]") {
              //console.log("should add " + $select.search);
              scope.data = null;
              textValue = "";
            }
            
            //For the Model List Edit View we need a way to return back the 
            //text value to be displayed. The config.json can specify the rowData
            //and textOutputPath to retrieve the data
            if (scope.rowData && scope.textOutputPath && item[scope.options.searchField]) {
              if (scope.textOutputPath.indexOf(".") > -1) {
                var path = scope.textOutputPath.split(".");
                var obj = scope.rowData;
                for (var i = 0; i < path.length-1; i++) {
                  var property = path[i];
                  if (!obj[property]) obj[property] = {};
                  obj = obj[property]; 
                }
                obj[path[path.length-1]] = textValue;
              } else {
                scope.rowData[scope.textOutputPath] = textValue;
              }
            }
            
            setTimeout(function() {
              //Needed in a timeout so the scope.data gets saved
              //before emitting ngGridEventEndCellEdit
              scope.$emit('ngGridEventEndCellEdit');
            }, 1);
         }
       };
       
       scope.onRemove = function(item, model) {
         if (scope.options.multiple) {
           //Remove item from array
           var index = scope.selected.items.indexOf(item);
           if (index > -1) {
             scope.selected.items.splice(index, 1);
             if (scope.options.junctionMeta) {
             //Make sure to loop through all items for junctionMeta (previously loaded items will not have junctionMeta populated)
               for (var i in scope.selected.items) {
                 var item = scope.selected.items[i];
                 //meta data for junction table in a many-to-many situation
                 item.junctionMeta = scope.options.junctionMeta; 
               }
             }
           }
           scope.modelData[scope.options.relationship] = scope.selected.items;
         } else {
           //For single record reference just assign null
           scope.data = null;
         }
       };
       
       scope.$on('ngGridEventStartCellEdit', function () {
         //When editing focus on the reference button
         element.find("button").trigger("click");
         element.find("input.ui-select-search").focus();
       });

        
       element.html(getTemplate(scope.options.multiple, scope.options.matchTemplate, scope.options.choiceTemplate)).show();
       $compile(element.contents())(scope);        
        
    }
  };
})

;