/*
 * Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
 * Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
 * Created By:
 * Maintained By:
 */

//= require can.jquery-all

can.Observe("can.Observe.TreeOptions", {
  defaults : {
    instance : undefined
    , children_drawn : false
  }
}, {
  // init : function() {
  //   this.bind("child_options.*.list", function(ev, newVal) {
  //     this.attr("children_drawn", !newVal.length)
  //     .attr("children_drawn", !!newVal.length);
  //   });
  // }
});

can.Control("CMS.Controllers.TreeView", {
  //static properties
  defaults : {
    model : null
    , list_view : "/static/mustache/controls/tree.mustache"
    , show_view : "/static/mustache/controls/show.mustache"
    , parent_id : null
    , list : null
    , single_object : false
    , find_params : {}
    , start_expanded : true
    , draw_children : true
    , find_function : null
    , options_property : "tree_view_options"
    , child_options : [] //this is how we can make nested configs. if you want to use an existing 
    //example child option :
    // { property : "controls", model : CMS.Models.Control, }
    // { parent_find_param : "system_id" ... }
  }
}, {
  //prototype properties
  setup : function(el, opts) {
    var that = this;
    typeof this._super === "function" && this._super.apply(this, [el]);
    if(opts instanceof can.Observe) {

      this.options = opts;
      if(this.options.model) {
        can.each(this.options.model[opts.options_property || this.constructor.defaults.options_property], function(v, k) {
          that.options.hasOwnProperty(k) || that.options.attr(k, v);
        });
      }      
      can.each(this.constructor.defaults, function(v, k) {
        that.options.hasOwnProperty(k) || that.options.attr(k, v);
      });
    } else {
      this.options = new can.Observe(this.constructor.defaults).attr(opts.model ? opts.model[opts.options_property || this.constructor.defaults.options_property] : {}).attr(opts);
    }
  }

  , init : function(el, opts) {
    this.options.list ? this.draw_list() : this.fetch_list(this.options.parent_id);
    this.element.attr("data-object-type", can.underscore(this.options.model.shortName)).data("object-type", can.underscore(this.options.model.shortName));
    this.element.attr("data-object-meta-type", can.underscore(window.cms_singularize(this.options.model.root_object))).data("object-meta-type", can.underscore(window.cms_singularize(this.options.model.root_object)));
  }
  , fetch_list : function() {
    if(can.isEmptyObject(this.options.find_params.serialize())) {
      this.options.find_params.attr("id", this.options.parent_id);
    }
    this.find_all_deferred = this.options.model[this.options.find_function || (this.options.single_object ? "findOne" : "findAll")](
      this.options.find_params.serialize()
    ).done(this.proxy("draw_list"));
  }
  , draw_list : function(list) {
    var that = this;
    if(list) {
      list = list.length == null ? [list] : list;
    } else {
      list = this.options.list;
    }
    list.bind("add", function(ev, newVals, index) {
      can.each(newVals, function(newVal) {
        that.element.trigger("newChild", new can.Observe.TreeOptions({instance : newVal}));
      });
    }).bind("remove", function(ev, oldVals, index) {
      can.each(oldVals, function(oldVal) {
        for(var i = that.options.list.length - 1; i >= 0; i--) {
          if(that.options.list[i].instance === oldVal) {
            that.options.list.splice(i, 1);
          }
        }
      });
    });
    can.Observe.startBatch();
    this.options.attr("list", []);
    can.each(list, function(v) {
      if(!(v instanceof can.Observe.TreeOptions)) {
        v = new can.Observe.TreeOptions().attr("instance", v).attr("start_expanded", that.options.start_expanded);
      }
      that.options.list.push(v);
      if(!v.instance.selfLink) {
        can.Observe.startBatch();
        v.instance.refresh().done(function() {
          can.Observe.stopBatch();
        });
      }
    });
    can.Observe.stopBatch();
    can.view(this.options.list_view, this.options, function(frag) {
      GGRC.queue_event(function() {
        that.element && that.element.html(frag);
        if(that.options.start_expanded) {
          that.add_child_lists(that.options.attr("list")); //since the view is handling adding new controllers now, configure before rendering.
        }
      });
    });
  }

  , ".item-main expand" : function(el, ev) {
    ev.stopPropagation();
    var instance = el.data("model");
    var parent = can.reduce(this.options.list, function(a, b) {
      switch(true) {
        case !!a : return a;
        case b.instance === instance: return b;
        default: return null;
      }
    }, null);
    if(!parent.child_options && this.options.draw_children) {
      this.add_child_lists_to_child(parent);
    }
  }

  , ".openclose:not(.active) click" : function(el, ev) {
    el.trigger("expand");
  }

  , add_child_lists : function(list) {
    var that = this;
    if(that.options.draw_children) {
      //Recursively define tree views anywhere we have subtree configs.
      can.each(list, function(item) {
        GGRC.queue_event(function() {
          that.add_child_lists_to_child(item);        
        });
      });
    }
  }

  , add_child_lists_to_child : function(item) {
    var that = this;
    if(!item.child_options)
      item.attr("child_options", new can.Observe.TreeOptions.List());
    can.each(this.options.child_options.length != null ? this.options.child_options : [this.options.child_options], function(data) {
      var options = new can.Observe.TreeOptions();
      data.each(function(v, k) {
        options.attr(k, v);
      });
      that.add_child_list(item, options);
      options.attr("options_property", that.options.options_property);
      item.child_options.push(options);
    });
  }

  // data is an entry from child options.  if child options is an array, run once for each.
  , add_child_list : function(item, data) {
    //var $subtree = $("<ul class='tree-structure'>").appendTo(el);
    //var model = $(el).closest("[data-model]").data("model");
    data.attr({ start_expanded : false });
    var find_params;
    if(data.property) {
      find_params = item.instance[data.property];
      if(find_params && find_params.length) {
        find_params = find_params.slice(0);
      }
      data.attr("list", find_params);
    } else {
      find_params = data.attr("find_params");
      if(find_params) {
        find_params = find_params.serialize();
      } else {
        find_params = {};
      }
      if(data.parent_find_param){
        find_params[data.parent_find_param] = item.instance.id;
      } else {
        find_params["parent.id"] = item.instance.id;
      }
      data.attr("find_params", new can.Observe(find_params));
    }
    // $subtree.cms_controllers_tree_view(opts);
  }

  , " newChild" : function(el, ev, data) {
    var that = this;
    var model;
    if(!this.options.parent_id || (this.options.parent_id === data.parent_id)) { // '==' just because null vs. undefined sometimes happens here
      model = data instanceof this.options.model ? data : new this.options.model(data.serialize ? data.serialize() : data);
      this.add_child_lists([model]);
      this.options.list.push(new can.Observe.TreeOptions({ instance : model}));
      setTimeout(function() {
        $("[data-object-id=" + data.id + "]").parents(".item-content").siblings(".item-main").openclose("open");
      }, 10);
      ev.stopPropagation();
    }
  }
  , ".edit-object modal:success" : function(el, ev, data) {
    var model = el.closest("[data-model]").data("model");
    model.attr(data[model.constructor.root_object] || data);
    ev.stopPropagation();
  }

  , ".link-object modal:success" : function(el, ev, data) {
    ev.stopPropagation();
    this.link_objects(
      el.data("child-type")
      , el.data("child-property")
      , el.closest("[data-object-id]")
      , data
    );
  }

  , " linkObject" : function(el, ev, data) {
    this.link_objects(
      data["childType"]
      , data["childProperty"]
      , this.element.children("[data-object-id=" + data["parentId"] + "]")
      , data.data
    );
  }

  , link_objects : function(child_object_type, child_property, $parent, data) {
    var that = this
    , parentid = $parent.data("object-id")
    , parent_object_type = $parent.data("object-meta-type") || window.cms_singularize($(document.body).data("page-type"))
    , $list = parentid 
        ? $parent.find(".item-content:first").children(".tree-structure[data-object-type=" + child_object_type + "]")
        : null
    , existing = parentid
        ? $list.children("[data-object-id]")
          .map(function() { return $(this).data("object-id")})
        : can.map(this.options.list, function(v, k) {
            return v.id;
          })
    , id_list = can.map(can.makeArray(data), function(v) {
      return v[parent_object_type + "_" + child_object_type][child_property];
    })
    , child_options = (parentid ? $list.control(CMS.Controllers.TreeView) : this).options
    , find_dfds = [];

    can.each(id_list, function(v) {
      //adds
      if(!~can.inArray(v, existing)) {
        find_dfds.push(child_options.model.findOne({id : v}));
      }
    })
    can.each(can.makeArray(existing), function(v) {
      //removes
      if(!~can.inArray(v, id_list)) {
        can.each(child_options.list, function(item, i) {
          if(item.id === v) {
            child_options.list.splice(i, 1);
            return false;
          }
        }) 
      }
    });

    if(find_dfds.length) {
      $.when.apply($, find_dfds).done(function() {
        var new_objs = can.makeArray(arguments);
        can.each(new_objs, function(obj) { 
          child_options.list.push(obj);
          //$list.control(CMS.Controllers.TreeView).add_child_lists($list.find("[data-object-id=" + obj.id + "]"));
        });
      });
    }

    ($list ? $list.parents(".item-content").siblings(".item-main") : this.element.children("li").children(".item-main")).openclose("open");
    if($parent && $parent.length) {
      var $box = $parent.closest(".content");
      setTimeout(function() {
        $box.scrollTop(0);
        $box.scrollTop($list.offset().top + $list.height() - $box.height() / 2);
      }, 300);
    }
  }

});